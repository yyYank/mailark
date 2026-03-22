import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { parseEmail, EmailMeta, Attachment, ByteRange } from './parser';
import { parseSearchQuery } from './queryParser';
import { convertPstToMbox, readPstAttachments } from './converter/pst';
import { getAppIconPath } from './iconPath';
import { applyAppMetadata } from './appMetadata';
import { tokenizeJapaneseText } from './searchTokenizer';
import { createLazySearchIndex } from './lazySearchIndex';

interface SearchParams {
  query?: string;
  offset?: number;
  limit?: number;
  sortOrder?: 'asc' | 'desc';
  excludeUnknown?: boolean;
}

let mainWindow: BrowserWindow | null = null;

// メールの byte 範囲。detail 取得時にファイルを再読み込みするために使う
const emailRangeCache = new Map<string, ByteRange>();
// PST由来メールのdescriptor ID。添付ファイルをオンデマンドで取得するために使う
const pstDescriptorCache = new Map<string, number>();
// メタデータリスト
let emailMetaList: EmailMeta[] = [];
// メールIDごとのmboxファイルパス（detail 再読み込み用）
const emailMboxPathCache = new Map<string, string>();
// メールIDごとのPSTファイルパス（PST由来添付のオンデマンド取得用）
const emailPstPathCache = new Map<string, string>();
const emailSearchIndex = createLazySearchIndex({
  tokenizer: tokenizeJapaneseText,
});

function createWindow(): void {
  const icon = getAppIconPath(__dirname, app.isPackaged);

  if (process.platform === 'darwin') {
    app.dock.setIcon(icon);
  }

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0f0f10',
    icon,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  mainWindow.loadFile(path.join(__dirname, '../src/index.html'));
}

applyAppMetadata(app);

app.whenReady().then(() => {
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// Open file dialog（複数ファイル選択対応）
ipcMain.handle('open-mbox-file', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Mail files', extensions: ['mbox', 'mbx', 'pst', ''] },
      { name: 'mbox files', extensions: ['mbox', 'mbx'] },
      { name: 'Outlook PST', extensions: ['pst'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths;
});

// Read and parse mbox files (PSTの場合は先にmboxへ変換する)
// 複数ファイルをマージして読み込む。全件はrendererに転送しない。件数だけ返す
ipcMain.handle('read-mbox', async (_event, filePaths: string[]) => {
  try {
    emailRangeCache.clear();
    pstDescriptorCache.clear();
    emailMboxPathCache.clear();
    emailPstPathCache.clear();
    emailMetaList = [];
    emailSearchIndex.reset();

    for (let i = 0; i < filePaths.length; i++) {
      const filePath = filePaths[i];
      let mboxPath = filePath;
      let pstPath = '';

      if (filePath.toLowerCase().endsWith('.pst')) {
        mainWindow?.webContents.send('load-progress', {
          percent: 0, count: emailMetaList.length, phase: 'converting',
          fileIndex: i + 1, fileCount: filePaths.length,
        });
        mboxPath = await convertPstToMbox(filePath, (percent, count) => {
          mainWindow?.webContents.send('load-progress', {
            percent: Math.floor(percent / 2), count: emailMetaList.length + count, phase: 'converting',
            fileIndex: i + 1, fileCount: filePaths.length,
          });
        });
        pstPath = filePath;
      }

      const newEmails = await parseMboxStream(mboxPath, pstPath);
      emailMetaList = emailMetaList.concat(newEmails);
    }
    return { total: emailMetaList.length };
  } catch (err) {
    return { error: (err as Error).message };
  }
});

// メール本文・添付をファイルから再読み込みして返す（キャッシュには持たない）
ipcMain.handle('get-email-detail', async (_event, id: string) => {
  const range = emailRangeCache.get(id);
  const mboxPath = emailMboxPathCache.get(id);
  if (!range || !mboxPath) return { body: '', htmlBody: '', attachments: [] };

  return new Promise<{ body: string; htmlBody: string; attachments: Attachment[] }>((resolve) => {
    const chunks: Buffer[] = [];
    const opts: { start: number; end?: number } = { start: range.byteStart };
    if (range.byteEnd > range.byteStart) opts.end = range.byteEnd - 1;

    fs.createReadStream(mboxPath, opts)
      .on('data', (chunk: Buffer | string) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
      .on('end', () => {
        try {
          const raw = Buffer.concat(chunks).toString('utf-8');
          const email = parseEmail(raw);
          if (!email) { resolve({ body: '', htmlBody: '', attachments: [] }); return; }

          // PST由来メールは添付をmboxから読まずPSTから直接取得する
          let attachments: Attachment[] = email.attachments;
          const descId = pstDescriptorCache.get(id);
          const pstPath = emailPstPathCache.get(id);
          if (pstPath && descId != null) {
            try {
              attachments = readPstAttachments(pstPath, descId);
            } catch {
              // PST読み込み失敗時はmbox由来の添付（空）のまま
            }
          }

          resolve({ body: email.body, htmlBody: email.htmlBody, attachments });
        } catch {
          resolve({ body: '', htmlBody: '', attachments: [] });
        }
      })
      .on('error', () => resolve({ body: '', htmlBody: '', attachments: [] }));
  });
});

// ページネーション付き検索
ipcMain.handle('search-emails', async (_event, { query, offset = 0, limit = 100, sortOrder = 'desc', excludeUnknown = false }: SearchParams) => {
  let results = emailMetaList;
  let scoredSearchResults = new Map<string, number>();

  if (excludeUnknown) {
    results = results.filter(em => !em.from.toLowerCase().includes('unknown@unknown.com'));
  }

  if (query) {
    const parsed = parseSearchQuery(query);
    // ① 構造フィルタ（from/to/since/until）で候補を絞る
    results = results.filter(em => {
      if (parsed.from && !em.from.toLowerCase().includes(parsed.from.toLowerCase())) return false;
      if (parsed.to && !em.to.toLowerCase().includes(parsed.to.toLowerCase())) return false;
      if (parsed.since !== undefined && em.dateObj < parsed.since) return false;
      if (parsed.until !== undefined && em.dateObj > parsed.until) return false;
      return true;
    });

    // ② 全文検索インデックスでさらに絞り込み、スコアを取得
    if (parsed.text) {
      const searchResults = await emailSearchIndex.search(parsed.text);
      scoredSearchResults = new Map(searchResults.map(result => [result.id, result.score]));
      results = results.filter(em => scoredSearchResults.has(em.id));
    }
  }

  const sorted = results.slice().sort((a, b) =>
    compareSearchResults(a, b, sortOrder, scoredSearchResults)
  );

  return {
    total: sorted.length,
    emails: sorted.slice(offset, offset + limit),
  };
});

function compareSearchResults(
  a: EmailMeta,
  b: EmailMeta,
  sortOrder: 'asc' | 'desc',
  scoredSearchResults: Map<string, number>,
): number {
  const scoreDiff = (scoredSearchResults.get(b.id) || 0) - (scoredSearchResults.get(a.id) || 0);
  if (scoreDiff !== 0) return scoreDiff;
  return sortOrder === 'asc' ? a.dateObj - b.dateObj : b.dateObj - a.dateObj;
}

// Save attachment to temp and open
ipcMain.handle('save-attachment', async (_event, { filename, data }: { filename: string; data: string }) => {
  const tmpDir = os.tmpdir();
  const outPath = path.join(tmpDir, filename);
  fs.writeFileSync(outPath, Buffer.from(data, 'base64'));
  shell.openPath(outPath);
  return outPath;
});

// ─── mbox parser ────────────────────────────────────────────────────────────

// Buffer ベースのストリームパーサー。byte offset を追跡して再読み込みに備える。
// body/htmlBody/添付は flush 後に捨て、検索 index 用の最小データだけ保持する。
function parseMboxStream(filePath: string, pstPath = ''): Promise<EmailMeta[]> {
  return new Promise((resolve, reject) => {
    const fileSize = fs.statSync(filePath).size;
    let bytesRead = 0;
    let lastPercent = -1;

    const emails: EmailMeta[] = [];
    let bufChunk = Buffer.alloc(0);
    let byteOffset = 0;
    let emailStartByte = -1;
    let currentLines: string[] = [];
    let inMessage = false;

    function flush(lines: string[], byteStart: number, byteEnd: number): void {
      try {
        const raw = lines.join('\n');
        const email = parseEmail(raw);
        if (!email) return;

        emailSearchIndex.add({
          id: email.id,
          from: email.from,
          to: email.to,
          subject: email.subject,
          body: extractSearchableBody(email.body, email.htmlBody),
        });
        emailRangeCache.set(email.id, { byteStart, byteEnd });
        emailMboxPathCache.set(email.id, filePath);
        if (pstPath) emailPstPathCache.set(email.id, pstPath);
        if (email.pstDescriptorId != null) {
          pstDescriptorCache.set(email.id, email.pstDescriptorId);
        }

        emails.push({
          id: email.id,
          from: email.from,
          to: email.to,
          subject: email.subject,
          date: email.date,
          dateObj: email.dateObj,
          attachmentCount: email.attachments.length,
        });
        // email.body / email.htmlBody / email.attachments はここでスコープ外になりGC対象
      } catch {
        // skip malformed
      }
    }

    const fileStream = fs.createReadStream(filePath);

    fileStream.on('data', (chunk: Buffer | string) => {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      bytesRead += buf.length;
      const percent = fileSize > 0 ? Math.min(Math.floor(bytesRead / fileSize * 100), 99) : 0;
      if (percent !== lastPercent) {
        lastPercent = percent;
        mainWindow?.webContents.send('load-progress', { percent, count: emails.length });
      }

      bufChunk = Buffer.concat([bufChunk, buf]);

      let newlinePos: number;
      while ((newlinePos = bufChunk.indexOf(10)) !== -1) { // 10 = '\n'
        const hasCR = newlinePos > 0 && bufChunk[newlinePos - 1] === 13; // 13 = '\r'
        const lineEnd = hasCR ? newlinePos - 1 : newlinePos;
        const lineBytes = newlinePos + 1; // \n を含むバイト数（\r があっても +1 のみ）
        const line = bufChunk.slice(0, lineEnd).toString('utf-8');

        if (/^From .+/.test(line)) {
          if (inMessage && currentLines.length > 0 && emailStartByte >= 0) {
            flush(currentLines, emailStartByte, byteOffset);
            currentLines = [];
          }
          // "From " 行の次から本文が始まる
          emailStartByte = byteOffset + lineBytes;
          inMessage = true;
        } else if (inMessage) {
          currentLines.push(line);
        }

        byteOffset += lineBytes;
        bufChunk = bufChunk.slice(newlinePos + 1);
      }
    });

    fileStream.on('end', () => {
      // 末尾に改行なしで終わる場合の残りバッファ処理
      if (bufChunk.length > 0) {
        if (inMessage) currentLines.push(bufChunk.toString('utf-8'));
        byteOffset += bufChunk.length;
      }
      if (inMessage && currentLines.length > 0 && emailStartByte >= 0) {
        flush(currentLines, emailStartByte, byteOffset);
      }
      mainWindow?.webContents.send('load-progress', { percent: 100, count: emails.length });
      resolve(emails);
    });

    fileStream.on('error', reject);
  });
}

// NOTE: style/script タグ内のノイズを先に除去してからタグを削除する。
// ただし正規表現ベースのため、ネストしたコメントや非標準タグには対応できない。
// 将来的に軽量HTMLパーサー（node-html-parser 等）への移行を検討すること。
function extractSearchableBody(body: string, htmlBody: string): string {
  if (body.trim()) return body;

  return htmlBody
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
