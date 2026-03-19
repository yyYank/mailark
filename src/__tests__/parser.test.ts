import {
  decodeBody,
  decodeHeader,
  parseDate,
  escapeRegex,
  parseEmail,
  parseMimePart,
} from '../parser';

// ─── decodeBody ──────────────────────────────────────────────────────────────

describe('decodeBody', () => {
  test('base64エンコードされた本文をデコードできる', () => {
    // "Hello, World!" を base64 エンコードした文字列
    const encoded = Buffer.from('Hello, World!').toString('base64');
    expect(decodeBody(encoded, 'base64')).toBe('Hello, World!');
  });

  test('base64エンコードで空白を含む文字列でもデコードできる', () => {
    // メールでは base64 が複数行に分割されて空白が入ることがある
    const encoded = Buffer.from('Hello, World!').toString('base64');
    const withSpaces = encoded.slice(0, 4) + '\n' + encoded.slice(4);
    expect(decodeBody(withSpaces, 'base64')).toBe('Hello, World!');
  });

  test('quoted-printableエンコードされた本文をデコードできる', () => {
    // "= " はソフト改行、"=E3=81=82" は "あ"
    const encoded = 'Hello=20World=\nthis is continued=E3=81=82';
    const result = decodeBody(encoded, 'quoted-printable');
    expect(result).toContain('Hello World');
    expect(result).toContain('this is continued');
    expect(result).toContain('あ');
  });

  test('quoted-printableのソフト改行（=\\r\\n）を除去できる', () => {
    const encoded = 'line one=\r\nline two';
    expect(decodeBody(encoded, 'quoted-printable')).toBe('line oneline two');
  });

  test('エンコードなしの場合はそのまま返す', () => {
    expect(decodeBody('plain text', '')).toBe('plain text');
    expect(decodeBody('plain text', '7bit')).toBe('plain text');
  });

  test('エンコード指定が大文字でもBase64をデコードできる', () => {
    const encoded = Buffer.from('test').toString('base64');
    expect(decodeBody(encoded, 'Base64')).toBe('test');
  });
});

// ─── decodeHeader ────────────────────────────────────────────────────────────

describe('decodeHeader', () => {
  test('エンコードなしのヘッダーをそのまま返す', () => {
    expect(decodeHeader('simple subject')).toBe('simple subject');
  });

  test('空文字列の場合は空文字列を返す', () => {
    expect(decodeHeader('')).toBe('');
  });

  test('RFC2047 Base64エンコード（B）をデコードできる', () => {
    // "テスト" を base64 でエンコード
    const base64 = Buffer.from('テスト').toString('base64');
    const encoded = `=?UTF-8?B?${base64}?=`;
    expect(decodeHeader(encoded)).toBe('テスト');
  });

  test('RFC2047 Quoted-Printable（Q）をデコードできる', () => {
    // "Hello" の Q エンコード（スペースは_）
    const encoded = '=?UTF-8?Q?Hello_World?=';
    expect(decodeHeader(encoded)).toBe('Hello World');
  });

  test('RFC2047 Quoted-Printable（Q）で16進数エスケープをデコードできる', () => {
    // 'A' = 0x41
    const encoded = '=?UTF-8?Q?=41?=';
    expect(decodeHeader(encoded)).toBe('A');
  });

  test('エンコードワードが複数ある場合もデコードできる', () => {
    const base64a = Buffer.from('こんにちは').toString('base64');
    const base64b = Buffer.from('世界').toString('base64');
    const encoded = `=?UTF-8?B?${base64a}?= =?UTF-8?B?${base64b}?=`;
    expect(decodeHeader(encoded)).toBe('こんにちは 世界');
  });

  test('エンコードなし部分とエンコードワードが混在する場合もデコードできる', () => {
    const base64 = Buffer.from('テスト').toString('base64');
    const encoded = `Subject: =?UTF-8?B?${base64}?=`;
    expect(decodeHeader(encoded)).toContain('テスト');
  });
});

// ─── parseDate ───────────────────────────────────────────────────────────────

describe('parseDate', () => {
  test('有効な日付文字列をタイムスタンプ（ミリ秒）に変換できる', () => {
    const result = parseDate('Thu, 01 Jan 2015 00:00:00 +0000');
    expect(result).toBe(new Date('Thu, 01 Jan 2015 00:00:00 +0000').getTime());
    expect(result).toBeGreaterThan(0);
  });

  test('undefinedの場合は0を返す', () => {
    expect(parseDate(undefined)).toBe(0);
  });

  test('空文字列の場合は0を返す', () => {
    expect(parseDate('')).toBe(0);
  });

  test('不正な日付文字列の場合は0を返す', () => {
    expect(parseDate('not a date')).toBe(0);
  });
});

// ─── escapeRegex ─────────────────────────────────────────────────────────────

describe('escapeRegex', () => {
  test('正規表現の特殊文字をエスケープできる', () => {
    expect(escapeRegex('.')).toBe('\\.');
    expect(escapeRegex('*')).toBe('\\*');
    expect(escapeRegex('+')).toBe('\\+');
    expect(escapeRegex('?')).toBe('\\?');
    expect(escapeRegex('^')).toBe('\\^');
    expect(escapeRegex('$')).toBe('\\$');
    expect(escapeRegex('{')).toBe('\\{');
    expect(escapeRegex('}')).toBe('\\}');
    expect(escapeRegex('(')).toBe('\\(');
    expect(escapeRegex(')')).toBe('\\)');
    expect(escapeRegex('|')).toBe('\\|');
    expect(escapeRegex('[')).toBe('\\[');
    expect(escapeRegex(']')).toBe('\\]');
    expect(escapeRegex('\\')).toBe('\\\\');
  });

  test('特殊文字を含む文字列をエスケープしてそのまま正規表現に使える', () => {
    const boundary = 'boundary.123+example';
    const escaped = escapeRegex(boundary);
    const regex = new RegExp(escaped);
    expect(regex.test(boundary)).toBe(true);
  });

  test('特殊文字を含まない文字列はそのまま返す', () => {
    expect(escapeRegex('hello')).toBe('hello');
    expect(escapeRegex('foo123bar')).toBe('foo123bar');
  });
});

// ─── parseEmail ──────────────────────────────────────────────────────────────

describe('parseEmail', () => {
  test('基本的なメールをパースできる', () => {
    const raw = [
      'From: sender@example.com',
      'To: recipient@example.com',
      'Subject: Test Email',
      'Date: Thu, 01 Jan 2015 00:00:00 +0000',
      '',
      'This is the body.',
    ].join('\n');

    const result = parseEmail(raw);
    expect(result).not.toBeNull();
    expect(result!.from).toBe('sender@example.com');
    expect(result!.to).toBe('recipient@example.com');
    expect(result!.subject).toBe('Test Email');
    expect(result!.body).toBe('This is the body.');
    expect(result!.dateObj).toBeGreaterThan(0);
  });

  test('FromもSubjectもない場合はnullを返す', () => {
    const raw = [
      'X-Custom: some-header',
      '',
      'body text',
    ].join('\n');

    expect(parseEmail(raw)).toBeNull();
  });

  test('Fromがない場合でもSubjectがあればパースできる', () => {
    const raw = [
      'Subject: Only Subject',
      '',
      'body',
    ].join('\n');

    const result = parseEmail(raw);
    expect(result).not.toBeNull();
    expect(result!.subject).toBe('Only Subject');
    expect(result!.from).toBe('(不明)');
  });

  test('Subjectがない場合はデフォルト値が入る', () => {
    const raw = [
      'From: sender@example.com',
      '',
      'body',
    ].join('\n');

    const result = parseEmail(raw);
    expect(result).not.toBeNull();
    expect(result!.subject).toBe('(件名なし)');
  });

  test('複数行に折り畳まれたヘッダーをパースできる', () => {
    const raw = [
      'From: sender@example.com',
      'Subject: Very long subject that is',
      ' folded across multiple lines',
      '',
      'body',
    ].join('\n');

    const result = parseEmail(raw);
    expect(result).not.toBeNull();
    expect(result!.subject).toBe('Very long subject that is folded across multiple lines');
  });

  test('rawフィールドは先頭200文字に切り詰められる', () => {
    const longBody = 'x'.repeat(500);
    const raw = [
      'From: sender@example.com',
      'Subject: Test',
      '',
      longBody,
    ].join('\n');

    const result = parseEmail(raw);
    expect(result).not.toBeNull();
    expect(result!.raw.length).toBeLessThanOrEqual(200);
  });

  test('各メールに一意のidが生成される', () => {
    const raw = [
      'From: sender@example.com',
      'Subject: Test',
      '',
      'body',
    ].join('\n');

    const result1 = parseEmail(raw);
    const result2 = parseEmail(raw);
    expect(result1!.id).not.toBe(result2!.id);
  });
});

// ─── parseMimePart ───────────────────────────────────────────────────────────

describe('parseMimePart', () => {
  test('text/plain の単一パートをパースできる', () => {
    const body = 'Hello, plain text!';
    const result = parseMimePart('text/plain', '', body, body);
    expect(result.body).toBe('Hello, plain text!');
    expect(result.htmlBody).toBe('');
    expect(result.attachments).toHaveLength(0);
  });

  test('text/html の単一パートをパースできる', () => {
    const body = '<h1>Hello HTML</h1>';
    const result = parseMimePart('text/html', '', body, body);
    expect(result.htmlBody).toBe('<h1>Hello HTML</h1>');
    expect(result.body).toBe('');
  });

  test('multipart/alternativeで text/plain と text/html を両方パースできる', () => {
    const boundary = 'boundary123';
    const fullRaw = [
      `--${boundary}`,
      'Content-Type: text/plain',
      '',
      'Plain text content',
      `--${boundary}`,
      'Content-Type: text/html',
      '',
      '<p>HTML content</p>',
      `--${boundary}--`,
    ].join('\n');

    const result = parseMimePart(`multipart/alternative; boundary="${boundary}"`, '', '', fullRaw);
    expect(result.body).toBe('Plain text content');
    expect(result.htmlBody).toBe('<p>HTML content</p>');
    expect(result.attachments).toHaveLength(0);
  });

  test('multipart/mixed で添付ファイルを検出できる', () => {
    const boundary = 'boundary456';
    const fileData = Buffer.from('file content').toString('base64');
    const fullRaw = [
      `--${boundary}`,
      'Content-Type: text/plain',
      '',
      'Email body',
      `--${boundary}`,
      'Content-Type: application/pdf; name="document.pdf"',
      'Content-Disposition: attachment; filename="document.pdf"',
      'Content-Transfer-Encoding: base64',
      '',
      fileData,
      `--${boundary}--`,
    ].join('\n');

    const result = parseMimePart(`multipart/mixed; boundary="${boundary}"`, '', '', fullRaw);
    expect(result.body).toBe('Email body');
    expect(result.attachments).toHaveLength(1);
    expect(result.attachments[0].filename).toBe('document.pdf');
    expect(result.attachments[0].contentType).toBe('application/pdf');
  });

  test('base64エンコードされた本文パートをデコードできる', () => {
    const encoded = Buffer.from('Hello from base64').toString('base64');
    const result = parseMimePart('text/plain', 'base64', encoded, encoded);
    expect(result.body).toBe('Hello from base64');
  });
});
