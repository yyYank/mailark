import { buildMboxEntry, formatMboxDate, collectMessages } from '../converter/pst';
import { PSTFolder, PSTMessage } from 'pst-extractor';

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

  test('bodyが空でhtmlBodyがある場合はContent-Typeがtext/htmlになる', () => {
    const msg = { ...baseMessage, body: '', bodyHTML: '<p>HTML content</p>' };
    const result = buildMboxEntry(msg as any);
    expect(result).toContain('Content-Type: text/html; charset=utf-8');
  });

  test('bodyがある場合はContent-Typeがtext/plainになる', () => {
    const result = buildMboxEntry(baseMessage as any);
    expect(result).toContain('Content-Type: text/plain; charset=utf-8');
  });

  test('bodyHTMLにHTMLタグがない場合はContent-Typeがtext/plainになる（改行保持のため）', () => {
    const msg = { ...baseMessage, body: '', bodyHTML: 'プレーンテキスト\n改行あり' };
    const result = buildMboxEntry(msg as any);
    expect(result).toContain('Content-Type: text/plain; charset=utf-8');
  });

  test('bodyHTMLにHTMLタグがない場合でも本文は保持される', () => {
    const msg = { ...baseMessage, body: '', bodyHTML: 'プレーンテキスト\n改行あり' };
    const result = buildMboxEntry(msg as any);
    expect(result).toContain('プレーンテキスト');
  });

  test('transportMessageHeadersのmultipart Content-Typeをhtml本文に合わせて置き換える', () => {
    const msg = {
      ...baseMessage,
      body: '',
      bodyHTML: '<p>HTML</p>',
      transportMessageHeaders:
        'From: sender@example.com\r\nMIME-Version: 1.0\r\nContent-Type: multipart/alternative;\r\n\tboundary="xyz"\r\nContent-Transfer-Encoding: quoted-printable\r\n',
    };
    const result = buildMboxEntry(msg as any);
    expect(result).toContain('Content-Type: text/html; charset=utf-8');
    expect(result).not.toContain('multipart/alternative');
    expect(result).not.toContain('Content-Transfer-Encoding');
    expect(result).not.toContain('MIME-Version');
    expect(result).toContain('<p>HTML</p>');
  });
});

// ─── collectMessages ──────────────────────────────────────────────────────────

describe('collectMessages', () => {
  function makeFolder(overrides: Partial<{
    contentCount: number;
    getNextChild: () => PSTMessage | null;
    getSubFolders: () => PSTFolder[];
    displayName: string;
  }>): PSTFolder {
    return {
      contentCount: 0,
      displayName: 'TestFolder',
      getNextChild: () => null,
      getSubFolders: () => [],
      ...overrides,
    } as unknown as PSTFolder;
  }

  test('getSubFoldersがエラーを投げてもクラッシュせず処理を続行する', () => {
    // SPAM Search Folder 2 のような壊れたフォルダを想定
    const brokenFolder = makeFolder({
      displayName: 'SPAM Search Folder 2',
      getSubFolders: () => { throw new Error('PSTFile::findBtreeItem Unable to find 8750 is desc: true'); },
    });
    const collected: PSTMessage[] = [];
    // 例外がスローされずに完了すること
    expect(() => collectMessages(brokenFolder, (msg) => collected.push(msg))).not.toThrow();
    expect(collected).toHaveLength(0);
  });

  test('getNextChildがエラーを投げてもクラッシュせずスキップする', () => {
    const brokenFolder = makeFolder({
      contentCount: 1,
      getNextChild: () => { throw new Error('PSTFile::findBtreeItem Unable to find 8750 is desc: true'); },
    });
    const collected: PSTMessage[] = [];
    expect(() => collectMessages(brokenFolder, (msg) => collected.push(msg))).not.toThrow();
    expect(collected).toHaveLength(0);
  });

  test('正常なフォルダのメッセージは収集できる', () => {
    // instanceof PSTMessage を通すため Object.create で本物のプロトタイプを持たせる
    const fakeMsg = Object.create(PSTMessage.prototype) as PSTMessage;
    let callCount = 0;
    const normalFolder = makeFolder({
      contentCount: 1,
      getNextChild: () => {
        // 1回目はメッセージ、2回目はnull（終端）
        if (callCount++ === 0) return fakeMsg;
        return null;
      },
    });
    const collected: PSTMessage[] = [];
    collectMessages(normalFolder, (msg) => collected.push(msg));
    expect(collected).toHaveLength(1);
    expect(collected[0]).toBe(fakeMsg);
  });

  test('壊れたサブフォルダをスキップして正常なサブフォルダは処理する', () => {
    const fakeMsg = Object.create(PSTMessage.prototype) as PSTMessage;
    let callCount = 0;
    const goodSubFolder = makeFolder({
      contentCount: 1,
      getNextChild: () => (callCount++ === 0 ? fakeMsg : null),
    });
    const brokenSubFolder = makeFolder({
      displayName: 'Broken',
      getSubFolders: () => { throw new Error('B-tree error'); },
    });
    const root = makeFolder({
      getSubFolders: () => [brokenSubFolder, goodSubFolder],
    });
    const collected: PSTMessage[] = [];
    expect(() => collectMessages(root, (msg) => collected.push(msg))).not.toThrow();
    expect(collected).toHaveLength(1);
  });
});
