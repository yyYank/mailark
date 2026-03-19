import { buildMboxEntry, formatMboxDate } from '../converter/pst';

// ─── formatMboxDate ──────────────────────────────────────────────────────────

describe('formatMboxDate', () => {
  test('Dateオブジェクトをmbox From行の日付形式に変換できる', () => {
    // mbox From行の日付: "Wed Jan 01 00:00:00 2020" 形式
    const d = new Date('2020-01-01T00:00:00.000Z');
    const result = formatMboxDate(d);
    expect(result).toMatch(/^\w{3} \w{3} \d{2} \d{2}:\d{2}:\d{2} \d{4}$/);
  });

  test('nullはUnix epochのフォールバック日付を返す', () => {
    const result = formatMboxDate(null);
    expect(result).toBeTruthy();
  });
});

// ─── buildMboxEntry ──────────────────────────────────────────────────────────

// PSTMessageの最低限のモック型
interface MockMessage {
  transportMessageHeaders: string;
  senderEmailAddress: string;
  clientSubmitTime: Date | null;
  subject: string;
  body: string;
  bodyHTML: string;
  displayTo: string;
}

describe('buildMboxEntry', () => {
  const baseMessage: MockMessage = {
    transportMessageHeaders: '',
    senderEmailAddress: 'sender@example.com',
    clientSubmitTime: new Date('2022-06-15T09:00:00.000Z'),
    subject: 'Test Subject',
    body: 'Hello, World!',
    bodyHTML: '',
    displayTo: 'recipient@example.com',
  };

  test('From行で始まるmboxエントリを生成できる', () => {
    const result = buildMboxEntry(baseMessage as any);
    expect(result).toMatch(/^From sender@example\.com /);
  });

  test('本文が含まれる', () => {
    const result = buildMboxEntry(baseMessage as any);
    expect(result).toContain('Hello, World!');
  });

  test('transportMessageHeadersがある場合はそれをヘッダーとして使う', () => {
    const msg = {
      ...baseMessage,
      transportMessageHeaders: 'From: sender@example.com\r\nSubject: Original\r\n',
    };
    const result = buildMboxEntry(msg as any);
    expect(result).toContain('Subject: Original');
  });

  test('transportMessageHeadersがない場合は合成ヘッダーを使う', () => {
    const result = buildMboxEntry(baseMessage as any);
    expect(result).toContain('From: sender@example.com');
    expect(result).toContain('Subject: Test Subject');
    expect(result).toContain('To: recipient@example.com');
  });

  test('本文中の"From "行をmboxエスケープ(">From ")する', () => {
    const msg = { ...baseMessage, body: 'From me with love\nNormal line' };
    const result = buildMboxEntry(msg as any);
    expect(result).toContain('>From me with love');
  });

  test('エントリは空行で終わる', () => {
    const result = buildMboxEntry(baseMessage as any);
    expect(result.endsWith('\n\n')).toBe(true);
  });

  test('bodyが空でhtmlBodyがある場合はHTML本文を使う', () => {
    const msg = { ...baseMessage, body: '', bodyHTML: '<p>HTML content</p>' };
    const result = buildMboxEntry(msg as any);
    expect(result).toContain('<p>HTML content</p>');
  });
});
