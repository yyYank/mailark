export interface EmailMeta {
  id: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  dateObj: number;
  attachmentCount: number;
}

export interface Attachment {
  filename: string;
  contentType: string;
  data: string;
  encoding: string;
}

export interface Email {
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

export interface ByteRange {
  byteStart: number;
  byteEnd: number;
}

export interface MimePart {
  body: string;
  htmlBody: string;
  attachments: Attachment[];
}

export function parseEmail(raw: string): Email | null {
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

export function parseMimePart(contentType: string, encoding: string, bodyRaw: string, fullRaw: string): MimePart {
  let body = '';
  let htmlBody = '';
  let attachments: Attachment[] = [];

  const boundaryMatch = contentType.match(/boundary="?([^";]+)"?/i);

  if (boundaryMatch) {
    // Multipart
    const boundary = boundaryMatch[1];
    const parts = fullRaw.split(new RegExp(`--${escapeRegex(boundary)}(?:--)?`));
    for (const part of parts.slice(1)) {
      if (!part.trim()) continue; // skip empty parts (e.g., after terminator --)
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

export function decodeBody(body: string, encoding: string): string {
  const enc = (encoding || '').toLowerCase().trim();
  if (enc === 'base64') {
    try {
      return Buffer.from(body.replace(/\s/g, ''), 'base64').toString('utf-8');
    } catch { return body; }
  }
  if (enc === 'quoted-printable') {
    const softLineBreakRemoved = body.replace(/=\r?\n/g, '');
    // collect consecutive hex-encoded bytes and decode as UTF-8
    const bytes: number[] = [];
    const result: string[] = [];
    const flush = () => {
      if (bytes.length > 0) {
        result.push(Buffer.from(bytes).toString('utf-8'));
        bytes.length = 0;
      }
    };
    let i = 0;
    while (i < softLineBreakRemoved.length) {
      if (softLineBreakRemoved[i] === '=' && i + 2 < softLineBreakRemoved.length) {
        const hex = softLineBreakRemoved.slice(i + 1, i + 3);
        if (/^[0-9A-Fa-f]{2}$/.test(hex)) {
          bytes.push(parseInt(hex, 16));
          i += 3;
          continue;
        }
      }
      flush();
      result.push(softLineBreakRemoved[i]);
      i++;
    }
    flush();
    return result.join('');
  }
  return body;
}

export function decodeHeader(value: string): string {
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

export function parseDate(dateStr: string | undefined): number {
  if (!dateStr) return 0;
  try {
    const t = new Date(dateStr).getTime();
    return isNaN(t) ? 0 : t;
  } catch { return 0; }
}

export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
