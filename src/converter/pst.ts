import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { PSTAttachment, PSTFile, PSTFolder, PSTMessage } from 'pst-extractor';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const BLOCK_TAG_RE = /<(html|body|div|p|table|ul|ol|li|h[1-6]|section|article|blockquote|pre|header|footer|main)\b/i;

interface BodySelection {
  plainBody: string;
  htmlBody: string;
  contentType: string;
}

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

  const { plainBody, htmlBody, contentType } = selectMessageBodies(message);
  const mimeVersionHeader = contentType.startsWith('multipart/')
    ? 'MIME-Version: 1.0\n'
    : '';

  let headers: string;
  if (message.transportMessageHeaders && message.transportMessageHeaders.trim()) {
    // transportHeadersのContent-Type/Content-Transfer-Encoding/MIME-Versionを除去し
    // 実際の本文に合わせたContent-Typeに置き換える
    let raw = message.transportMessageHeaders.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    raw = raw.replace(/^Content-Type:[^\n]*(?:\n[ \t][^\n]*)*/gim, '');
    raw = raw.replace(/^Content-Transfer-Encoding:[^\n]*(?:\n[ \t][^\n]*)*/gim, '');
    raw = raw.replace(/^MIME-Version:[^\n]*/gim, '');
    raw = raw.replace(/\n{2,}/g, '\n').trim();
    headers = `${raw}\n${mimeVersionHeader}Content-Type: ${contentType}\n`;
  } else {
    const date = message.clientSubmitTime
      ? message.clientSubmitTime.toUTCString()
      : new Date(0).toUTCString();
    headers = [
      `From: ${from}`,
      `To: ${message.displayTo || ''}`,
      `Subject: ${message.subject || ''}`,
      `Date: ${date}`,
      ...(mimeVersionHeader ? [mimeVersionHeader.trimEnd()] : []),
      `Content-Type: ${contentType}`,
    ].join('\n') + '\n';
  }

  const body = buildBodyContent(plainBody, htmlBody);

  // 添付ファイルはmboxに含めずオンデマンド取得のためdescriptor IDだけ記録する
  const descId = message.descriptorNodeId?.toNumber?.();
  const pstDescHeader = descId != null ? `X-Mailark-Pst-Desc: ${descId}\n` : '';

  return `${fromLine}${headers}${pstDescHeader}\n${body}\n\n`;
}

/**
 * RTF文字列をプレーンテキストに変換する（改行保持を主目的とした最小実装）。
 * pst-extractorが \par / \line を改行に変換できなかった場合のフォールバック。
 *
 * 処理順序:
 *   1. \par / \line → \n（段落・ソフト改行）
 *   2. \'xx → Latin-1文字（RTFのバイト列エスケープ）
 *   3. \uN? → Unicode文字
 *   4. 残りのRTFコントロールワード / シンボルを削除
 *   5. グループ区切り {} を削除
 */
export function rtfToPlainText(rtf: string): string {
  if (!rtf) return '';
  let t = rtf;
  // \par / \line を改行に（末尾の任意の空白も消費）
  t = t.replace(/\\par\b[ \t]*/g, '\n');
  t = t.replace(/\\line\b[ \t]*/g, '\n');
  t = t.replace(/\\tab\b[ \t]*/g, '\t');
  // \'xx → 文字（Windows-1252 / Latin-1 範囲を想定）
  t = t.replace(/\\'([0-9a-fA-F]{2})/g, (_, h) =>
    String.fromCharCode(parseInt(h, 16))
  );
  // \uN? → Unicode（負数は+65536して扱う）
  t = t.replace(/\\u(-?\d+)\??/g, (_, c) => {
    const n = parseInt(c);
    try { return String.fromCodePoint(n < 0 ? n + 65536 : n); } catch { return ''; }
  });
  // エスケープされたリテラル文字 \\ \{ \} を変換
  t = t.replace(/\\([\\{}])/g, '$1');
  // 残りのRTFコントロールワード（\word / \word-123 / \word123 など）
  t = t.replace(/\\[a-z][a-z0-9]*-?\d*[ \t]?/gi, '');
  // 残りのRTFコントロールシンボル
  t = t.replace(/\\[^a-z\s]/gi, '');
  // グループ区切り文字
  t = t.replace(/[{}]/g, '');
  // 行内の連続空白を単一スペースに（改行は保持）
  t = t.replace(/[ \t]+/g, ' ');
  // 4つ以上の連続改行を2つに圧縮
  t = t.replace(/\n{4,}/g, '\n\n');
  return t.trim();
}

function selectMessageBodies(message: PSTMessage): BodySelection {
  // pst-extractorはMIMEをデコード済みでbody/bodyHTMLを提供するため、
  // 元のmultipart Content-Typeを持ち込まず実際の内容に合わせて設定し直す

  // body（PR_BODY）に改行がない場合は bodyRTF からフォールバック変換する。
  // pst-extractorのRTF→テキスト変換が \par を改行に変換できないケースへの対処。
  let plainBody = message.body || '';
  if (plainBody && !plainBody.includes('\n') && message.bodyRTF) {
    const fromRtf = rtfToPlainText(message.bodyRTF);
    if (fromRtf.includes('\n')) plainBody = fromRtf;
  } else if (!plainBody && message.bodyRTF) {
    plainBody = rtfToPlainText(message.bodyRTF);
  }
  const hasPlainBody = !!plainBody.trim();
  const rawHtmlBody = message.bodyHTML || '';
  const hasHtmlBody = !!rawHtmlBody.trim();
  const hasBlockTags = hasHtmlBody && BLOCK_TAG_RE.test(rawHtmlBody);
  const hasAnyTag = hasHtmlBody && /<[a-z]/i.test(rawHtmlBody);
  const hasInlineTagsOnly = hasAnyTag && !hasBlockTags;

  let normalizedHtmlBody = '';
  if (hasBlockTags) {
    normalizedHtmlBody = rawHtmlBody;
  } else if (hasInlineTagsOnly) {
    normalizedHtmlBody = rawHtmlBody
      .replace(/\r\n/g, '\n').replace(/\r/g, '\n')
      .replace(/\n/g, '<br>\n');
  }

  if (hasPlainBody && normalizedHtmlBody) {
    return {
      plainBody,
      htmlBody: normalizedHtmlBody,
      contentType: 'multipart/alternative; boundary="mailark-alt"',
    };
  }

  if (hasPlainBody) {
    return {
      plainBody,
      htmlBody: '',
      contentType: 'text/plain; charset=utf-8',
    };
  }

  if (normalizedHtmlBody) {
    return {
      plainBody: '',
      htmlBody: normalizedHtmlBody,
      contentType: 'text/html; charset=utf-8',
    };
  }

  return {
    plainBody: rawHtmlBody,
    htmlBody: '',
    contentType: 'text/plain; charset=utf-8',
  };
}

function buildBodyContent(plainBody: string, htmlBody: string): string {
  if (plainBody && htmlBody) {
    return [
      '--mailark-alt',
      'Content-Type: text/plain; charset=utf-8',
      '',
      escapeMboxBody(plainBody),
      '--mailark-alt',
      'Content-Type: text/html; charset=utf-8',
      '',
      escapeMboxBody(htmlBody),
      '--mailark-alt--',
    ].join('\n');
  }

  return escapeMboxBody(plainBody || htmlBody);
}

/**
 * PSTファイルから特定メッセージの添付ファイルをオンデマンドで読み込む。
 * mboxには添付データを含めず、詳細取得時にdescriptor IDで直接アクセスする。
 */
export function readPstAttachments(
  pstPath: string,
  descriptorId: number
): Array<{ filename: string; contentType: string; data: string; encoding: string }> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Long = require('long') as typeof import('long');
  const pstFile = new PSTFile(pstPath);
  try {
    const node = pstFile.getDescriptorIndexNode(Long.fromNumber(descriptorId));
    const msg = new PSTMessage(pstFile, node);
    const result: Array<{ filename: string; contentType: string; data: string; encoding: string }> = [];
    for (let i = 0; i < msg.numberOfAttachments; i++) {
      const att = msg.getAttachment(i);
      if (!att) continue;
      try {
        const stream = att.fileInputStream;
        if (!stream) continue;
        const buf = Buffer.alloc(att.filesize);
        stream.readCompletely(buf);
        result.push({
          filename: att.longFilename || att.filename || `attachment-${i}`,
          contentType: att.mimeTag || 'application/octet-stream',
          data: buf.toString('base64'),
          encoding: 'base64',
        });
      } catch {
        // 読み込み失敗した添付はスキップ
      }
    }
    return result;
  } finally {
    pstFile.close();
  }
}

function escapeMboxBody(body: string): string {
  return body.replace(/^From /gm, '>From ');
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

      // chunks.join('')は大量添付時にInvalid string lengthになるため、1件ずつ書き込む
      let writeError: Error | null = null;
      collectMessages(root2, (msg) => {
        if (!writeError) {
          writeStream.write(buildMboxEntry(msg), (err) => {
            if (err) writeError = err;
          });
        }
        processedCount++;
        if (onProgress && totalCount > 0) {
          const percent = Math.min(Math.floor(processedCount / totalCount * 100), 99);
          onProgress(percent, processedCount);
        }
      });

      writeStream.end((err: Error | null | undefined) => {
        const finalErr = writeError || err;
        if (finalErr) { reject(finalErr); return; }
        onProgress?.(100, processedCount);
        pstFile.close();
        pstFile2.close();
        resolve(outPath);
      });
    } catch (err) {
      writeStream.destroy();
      reject(err);
    }
  });
}
