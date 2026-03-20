import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { PSTFile, PSTFolder, PSTMessage } from 'pst-extractor';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * DateをmboxのFrom行用日付文字列に変換する
 * 形式: "Wed Jan 01 00:00:00 2020"
 */
export function formatMboxDate(date: Date | null): string {
  const d = date ?? new Date(0);
  const day = DAYS[d.getDay()];
  const mon = MONTHS[d.getMonth()];
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${day} ${mon} ${dd} ${hh}:${mm}:${ss} ${d.getFullYear()}`;
}

/**
 * PSTMessageを1件分のmboxエントリ文字列に変換する
 */
export function buildMboxEntry(message: PSTMessage): string {
  const from = message.senderEmailAddress || 'unknown@unknown.com';
  const dateStr = formatMboxDate(message.clientSubmitTime);
  const fromLine = `From ${from} ${dateStr}\n`;

  // 使用する本文とContent-Typeを決定
  // pst-extractorはMIMEをデコード済みでbody/bodyHTMLを提供するため、
  // 元のmultipart Content-Typeを持ち込まず実際の内容に合わせて設定し直す
  const hasPlainBody = !!(message.body && message.body.trim());
  const hasHtmlBody = !!(message.bodyHTML && message.bodyHTML.trim());
  const useHtml = !hasPlainBody && hasHtmlBody;
  const rawBody = hasPlainBody ? message.body : (message.bodyHTML || '');
  const contentType = useHtml ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8';

  let headers: string;
  if (message.transportMessageHeaders && message.transportMessageHeaders.trim()) {
    // transportHeadersのContent-Type/Content-Transfer-Encoding/MIME-Versionを除去し
    // 実際の本文に合わせたContent-Typeに置き換える
    let raw = message.transportMessageHeaders.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    raw = raw.replace(/^Content-Type:[^\n]*(?:\n[ \t][^\n]*)*/gim, '');
    raw = raw.replace(/^Content-Transfer-Encoding:[^\n]*(?:\n[ \t][^\n]*)*/gim, '');
    raw = raw.replace(/^MIME-Version:[^\n]*/gim, '');
    raw = raw.replace(/\n{2,}/g, '\n').trim();
    headers = `${raw}\nContent-Type: ${contentType}\n`;
  } else {
    const date = message.clientSubmitTime
      ? message.clientSubmitTime.toUTCString()
      : new Date(0).toUTCString();
    headers = [
      `From: ${from}`,
      `To: ${message.displayTo || ''}`,
      `Subject: ${message.subject || ''}`,
      `Date: ${date}`,
      `Content-Type: ${contentType}`,
    ].join('\n') + '\n';
  }

  // mboxエスケープ: 本文中の行頭 "From " を ">From " に変換
  const body = rawBody.replace(/^From /gm, '>From ');

  return `${fromLine}${headers}\n${body}\n\n`;
}

/**
 * PSTフォルダを再帰的にたどり、全メッセージを収集してmbox文字列を構築する
 */
export function collectMessages(
  folder: PSTFolder,
  onMessage: (msg: PSTMessage) => void
): void {
  if (folder.contentCount > 0) {
    try {
      let msg = folder.getNextChild();
      while (msg != null) {
        if (msg instanceof PSTMessage) {
          onMessage(msg);
        }
        msg = folder.getNextChild();
      }
    } catch (e) {
      // B-treeエントリが欠損している壊れたフォルダはスキップ
      console.warn(`PSTメッセージ取得をスキップ (folder: ${folder.displayName}):`, e);
    }
  }
  let subFolders: PSTFolder[];
  try {
    subFolders = folder.getSubFolders();
  } catch (e) {
    // 検索フォルダ等でB-treeが見つからない場合はサブフォルダごとスキップ
    console.warn(`PSTサブフォルダ取得をスキップ (folder: ${folder.displayName}):`, e);
    return;
  }
  for (const subFolder of subFolders) {
    collectMessages(subFolder, onMessage);
  }
}

/**
 * PSTファイルをmboxファイルに変換して一時ファイルパスを返す
 */
export async function convertPstToMbox(
  pstPath: string,
  onProgress?: (percent: number, count: number) => void
): Promise<string> {
  const outPath = path.join(os.tmpdir(), `mailark-${Date.now()}.mbox`);
  const writeStream = fs.createWriteStream(outPath, { encoding: 'utf-8' });

  return new Promise((resolve, reject) => {
    try {
      const pstFile = new PSTFile(pstPath);
      const root = pstFile.getRootFolder();

      // 全メッセージ数を先にカウント（進捗計算用）
      let totalCount = 0;
      let processedCount = 0;

      // 先にカウントパス
      collectMessages(root, () => { totalCount++; });

      // 再度開いて変換
      const pstFile2 = new PSTFile(pstPath);
      const root2 = pstFile2.getRootFolder();

      const chunks: string[] = [];
      collectMessages(root2, (msg) => {
        chunks.push(buildMboxEntry(msg));
        processedCount++;
        if (onProgress && totalCount > 0) {
          const percent = Math.min(Math.floor(processedCount / totalCount * 100), 99);
          onProgress(percent, processedCount);
        }
      });

      writeStream.write(chunks.join(''), (err) => {
        if (err) { reject(err); return; }
        writeStream.end(() => {
          onProgress?.(100, processedCount);
          pstFile.close();
          pstFile2.close();
          resolve(outPath);
        });
      });
    } catch (err) {
      writeStream.destroy();
      reject(err);
    }
  });
}
