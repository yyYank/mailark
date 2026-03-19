import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

interface EmailMeta {
  id: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  dateObj: number;
  attachmentCount: number;
}

interface Attachment {
  filename: string;
  contentType: string;
  data: string;
  encoding: string;
}

interface Email {
  id: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  dateObj: number;
  body: string;
  htmlBody: string;
  attachments: Attachment[];
  raw: string;
}

interface ByteRange {
  byteStart: number;
  byteEnd: number;
}

interface MimePart {
  body: string;
  htmlBody: string;
  attachments: Attachment[];
}

interface SearchParams {
  query?: string;
  offset?: number;
  limit?: number;
  sortOrder?: 'asc' | 'desc';
  excludeUnknown?: boolean;
}

let mainWindow: BrowserWindow | null = null;

// 検索用テキスト（最大500文字・小文字）のみを保持。body/htmlBody/添付は持たない
const emailSearchCache = new Map<string, string>();
// メールの byte 範囲。detail 取得時にファイルを再読み込みするために使う
const emailRangeCache = new Map<string, ByteRange>();
// メタデータリスト
let emailMetaList: EmailMeta[] = [];
// 現在開いているファイルパス（detail 再読み込み用）
let currentMboxPath = '';

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0f0f10',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  mainWindow.loadFile(path.join(__dirname, '../src/index.html'));
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// Open file dialog
ipcMain.handle('open-mbox-file', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'mbox files', extensions: ['mbox', 'mbx', ''] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

// Read and parse mbox file
// 全件はrendererに転送しない。件数だけ返してページ取得はsearch-emailsで行う
ipcMain.handle('read-mbox', async (_event, filePath: string) => {
  try {
    emailSearchCache.clear();
    emailRangeCache.clear();
    emailMetaList = [];
    currentMboxPath = filePath;
    emailMetaList = await parseMboxStream(filePath);
    return { total: emailMetaList.length };
  } catch (err) {
    return { error: (err as Error).message };
  }
});

// メール本文・添付をファイルから再読み込みして返す（キャッシュには持たない）
ipcMain.handle('get-email-detail', async (_event, id: string) => {
  const range = emailRangeCache.get(id);
  if (!range || !currentMboxPath) return { body: '', htmlBody: '', attachments: [] };

  return new Promise<{ body: string; htmlBody: string; attachments: Attachment[] }>((resolve) => {
    const chunks: Buffer[] = [];
    const opts: { start: number; end?: number } = { start: range.byteStart };
    if (range.byteEnd > range.byteStart) opts.end = range.byteEnd - 1;

    fs.createReadStream(currentMboxPath, opts)
      .on('data', (chunk: Buffer | string) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
      .on('end', () => {
        try {
          const raw = Buffer.concat(chunks).toString('utf-8');
          const email = parseEmail(raw);
          resolve(email
            ? { body: email.body, htmlBody: email.htmlBody, attachments: email.attachments }
            : { body: '', htmlBody: '', attachments: [] });
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

  if (excludeUnknown) {
    results = results.filter(em => !em.from.toLowerCase().includes('unknown@unknown.com'));
  }

  if (query) {
    const q = query.toLowerCase();
    results = results.filter(em => {
      if (em.from.toLowerCase().includes(q)) return true;
      if (em.to.toLowerCase().includes(q)) return true;
      if (em.subject.toLowerCase().includes(q)) return true;
      const searchText = emailSearchCache.get(em.id) || '';
      return searchText.includes(q);
    });
  }

  const sorted = results.slice().sort((a, b) =>
    sortOrder === 'asc' ? a.dateObj - b.dateObj : b.dateObj - a.dateObj
  );

  return {
    total: sorted.length,
    emails: sorted.slice(offset, offset + limit),
  };
});

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
// body/htmlBody/添付は flush 後に捨て、検索用テキスト（最大500文字）だけ保持。
function parseMboxStream(filePath: string): Promise<EmailMeta[]> {
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

        // 検索用テキスト（最大500文字・小文字）だけ保持
        let searchText = email.body;
        if (!searchText && email.htmlBody) {
          searchText = email.htmlBody.replace(/<[^>]*>/g, ' ');
        }
        emailSearchCache.set(email.id, searchText.slice(0, 500).toLowerCase());
        emailRangeCache.set(email.id, { byteStart, byteEnd });

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

function parseEmail(raw: string): Email | null {
  const [headerSection, ...bodyParts] = raw.split(/\r?\n\r?\n/);
  const bodyRaw = bodyParts.join('\n\n');

  // Parse headers
  const headers: Record<string, string> = {};
  const headerLines = headerSection.replace(/\r?\n\s+/g, ' ').split(/\r?\n/);
  for (const line of headerLines) {
    const match = line.match(/^([^:]+):\s*(.*)$/);
    if (match) {
      const key = match[1].toLowerCase();
      headers[key] = decodeHeader(match[2]);
    }
  }

  if (!headers['from'] && !headers['subject']) return null;

  // Parse MIME
  const contentType = headers['content-type'] || 'text/plain';
  const { body, attachments, htmlBody } = parseMimePart(contentType, headers['content-transfer-encoding'] || '', bodyRaw, raw);

  return {
    id: Math.random().toString(36).substr(2, 9),
    from: headers['from'] || '(不明)',
    to: headers['to'] || '',
    subject: headers['subject'] || '(件名なし)',
    date: headers['date'] || '',
    dateObj: parseDate(headers['date']),
    body: body || '',
    htmlBody: htmlBody || '',
    attachments,
    raw: raw.substring(0, 200),
  };
}

function parseMimePart(contentType: string, encoding: string, bodyRaw: string, fullRaw: string): MimePart {
  let body = '';
  let htmlBody = '';
  let attachments: Attachment[] = [];

  const boundaryMatch = contentType.match(/boundary="?([^";]+)"?/i);

  if (boundaryMatch) {
    // Multipart
    const boundary = boundaryMatch[1];
    const parts = fullRaw.split(new RegExp(`--${escapeRegex(boundary)}(?:--)?`));
    for (const part of parts.slice(1)) {
      const [partHeaderRaw, ...partBodyParts] = part.split(/\r?\n\r?\n/);
      const partBody = partBodyParts.join('\n\n').trim();
      const partHeaders: Record<string, string> = {};
      const partHeaderLines = partHeaderRaw.replace(/\r?\n\s+/g, ' ').split(/\r?\n/);
      for (const line of partHeaderLines) {
        const m = line.match(/^([^:]+):\s*(.*)$/);
        if (m) partHeaders[m[1].toLowerCase()] = m[2];
      }
      const partCT = partHeaders['content-type'] || 'text/plain';
      const partEnc = partHeaders['content-transfer-encoding'] || '';
      const partDisp = partHeaders['content-disposition'] || '';
      const filenameMatch = partCT.match(/name="?([^";]+)"?/i) || partDisp.match(/filename="?([^";]+)"?/i);

      if (partCT.includes('text/plain') && !partDisp.includes('attachment')) {
        body = decodeBody(partBody, partEnc);
      } else if (partCT.includes('text/html') && !partDisp.includes('attachment')) {
        htmlBody = decodeBody(partBody, partEnc);
      } else if (filenameMatch || partDisp.includes('attachment')) {
        attachments.push({
          filename: filenameMatch ? filenameMatch[1] : 'attachment',
          contentType: partCT.split(';')[0].trim(),
          data: partBody.replace(/\s/g, ''),
          encoding: partEnc,
        });
      } else if (partCT.includes('multipart/')) {
        // nested multipart
        const nested = parseMimePart(partCT, partEnc, partBody, part);
        if (nested.body) body = nested.body;
        if (nested.htmlBody) htmlBody = nested.htmlBody;
        attachments = attachments.concat(nested.attachments);
      }
    }
  } else {
    // Single part
    if (contentType.includes('text/html')) {
      htmlBody = decodeBody(bodyRaw, encoding);
    } else {
      body = decodeBody(bodyRaw, encoding);
    }
  }

  return { body, htmlBody, attachments };
}

function decodeBody(body: string, encoding: string): string {
  const enc = (encoding || '').toLowerCase().trim();
  if (enc === 'base64') {
    try {
      return Buffer.from(body.replace(/\s/g, ''), 'base64').toString('utf-8');
    } catch { return body; }
  }
  if (enc === 'quoted-printable') {
    return body
      .replace(/=\r?\n/g, '')
      .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  }
  return body;
}

function decodeHeader(value: string): string {
  if (!value) return '';
  // RFC2047 encoded words: =?charset?encoding?text?=
  return value.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_match, _charset, enc, text) => {
    try {
      if (enc.toUpperCase() === 'B') {
        return Buffer.from(text, 'base64').toString('utf-8');
      } else {
        const decoded = text.replace(/_/g, ' ').replace(/=([0-9A-Fa-f]{2})/g, (_: string, hex: string) =>
          String.fromCharCode(parseInt(hex, 16))
        );
        return decoded;
      }
    } catch { return text; }
  });
}

function parseDate(dateStr: string | undefined): number {
  if (!dateStr) return 0;
  try { return new Date(dateStr).getTime(); } catch { return 0; }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
