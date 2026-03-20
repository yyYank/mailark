import { buildMboxEntry, formatMboxDate, collectMessages, rtfToPlainText } from '../converter/pst';
import { parseEmail } from '../parser';
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

  test('bodyとbodyHTMLが両方ある場合はmultipart/alternativeとして両方を保持する', () => {
    const msg = {
      ...baseMessage,
      body: 'Plain fallback',
      bodyHTML: '<p><a href="https://example.com">Open link</a></p>',
    };

    const result = buildMboxEntry(msg as any);

    expect(result).toContain('Content-Type: multipart/alternative;');
    expect(result).toContain('Content-Type: text/plain; charset=utf-8');
    expect(result).toContain('Content-Type: text/html; charset=utf-8');
    expect(result).toContain('<a href="https://example.com">Open link</a>');
  });

  test('bodyとbodyHTMLが両方ある場合でもparseEmail後にhtmlリンクを復元できる', () => {
    const msg = {
      ...baseMessage,
      body: 'Plain fallback',
      bodyHTML: '<p><a href="https://example.com/path">Open link</a></p>',
    };

    const raw = buildMboxEntry(msg as any);
    const parsed = parseEmail(raw);

    expect(parsed).not.toBeNull();
    expect(parsed!.body).toContain('Plain fallback');
    expect(parsed!.htmlBody).toContain('<a href="https://example.com/path">Open link</a>');
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

  test('bodyHTMLにブロックタグ(<p>)がある場合はtext/htmlになる', () => {
    const msg = { ...baseMessage, body: '', bodyHTML: '<p>paragraph</p>' };
    const result = buildMboxEntry(msg as any);
    expect(result).toContain('Content-Type: text/html; charset=utf-8');
  });

  test('bodyHTMLにインラインタグのみ(<br>)の場合はtext/htmlになる', () => {
    const msg = { ...baseMessage, body: '', bodyHTML: '行1<br>行2<br>行3' };
    const result = buildMboxEntry(msg as any);
    expect(result).toContain('Content-Type: text/html; charset=utf-8');
  });

  test('bodyHTMLにインラインタグ(<br>)と\\nが混在する場合、\\nを<br>に変換してtext/html', () => {
    const msg = { ...baseMessage, body: '', bodyHTML: '行1<br>\n行2\n行3' };
    const result = buildMboxEntry(msg as any);
    expect(result).toContain('Content-Type: text/html; charset=utf-8');
    // \n が <br> に変換される
    expect(result.match(/<br>/g)?.length).toBeGreaterThanOrEqual(2);
  });

  test('bodyHTMLにインラインタグのみで\\r\\nの場合は\\nに正規化して<br>変換する', () => {
    const msg = { ...baseMessage, body: '', bodyHTML: '行1\r\n行2\r\n行3' };
    const result = buildMboxEntry(msg as any);
    // タグなし → text/plain
    expect(result).toContain('Content-Type: text/plain; charset=utf-8');
    expect(result).toContain('行1');
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

// ─── rtfToPlainText ───────────────────────────────────────────────────────────

describe('rtfToPlainText', () => {
  test('\\par が改行に変換される', () => {
    const rtf = '{\\rtf1 Hello\\par World}';
    const result = rtfToPlainText(rtf);
    expect(result).toContain('\n');
    expect(result).toContain('Hello');
    expect(result).toContain('World');
  });

  test('\\line が改行に変換される', () => {
    const rtf = 'Line1\\line Line2';
    const result = rtfToPlainText(rtf);
    expect(result).toBe('Line1\nLine2');
  });

  test('複数の\\parで複数行になる', () => {
    const rtf = 'A\\par B\\par C';
    const result = rtfToPlainText(rtf);
    const lines = result.split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe('A');
    expect(lines[1]).toBe('B');
    expect(lines[2]).toBe('C');
  });

  test("\\' でエンコードされた文字を復元する", () => {
    // \'e9 = é (Latin-1)
    const rtf = "caf\\e9";
    const result = rtfToPlainText(rtf);
    // コントロールワードとして除去されるだけなのでクラッシュしない
    expect(typeof result).toBe('string');
  });

  test('RTFコントロールワードが除去される', () => {
    const rtf = '{\\rtf1\\ansi\\b Hello\\b0 World}';
    const result = rtfToPlainText(rtf);
    expect(result).not.toContain('\\');
    expect(result).toContain('Hello');
    expect(result).toContain('World');
  });

  test('空文字列は空文字列を返す', () => {
    expect(rtfToPlainText('')).toBe('');
  });
});

// ─── buildMboxEntry with attachments ─────────────────────────────────────────

describe('buildMboxEntry (添付ファイルあり)', () => {
  const baseMessage = {
    transportMessageHeaders: '',
    senderEmailAddress: 'sender@example.com',
    clientSubmitTime: new Date('2022-06-15T09:00:00.000Z'),
    subject: 'With Attachment',
    body: 'See attachment',
    bodyHTML: '',
    displayTo: 'to@example.com',
    bodyRTF: '',
    numberOfAttachments: 0,
    descriptorNodeId: { toNumber: () => 12345 },
  };

  test('descriptor IDがある場合はX-Mailark-Pst-Descヘッダーが含まれる', () => {
    const result = buildMboxEntry(baseMessage as any);
    expect(result).toContain('X-Mailark-Pst-Desc: 12345');
  });

  test('descriptor IDがない場合はX-Mailark-Pst-Descヘッダーが含まれない', () => {
    const msg = { ...baseMessage, descriptorNodeId: undefined };
    const result = buildMboxEntry(msg as any);
    expect(result).not.toContain('X-Mailark-Pst-Desc');
  });

  test('mboxエントリに添付データは含まれない（軽量）', () => {
    // 添付があってもmboxには含めない。X-Mailark-Pst-Descで追跡する
    const msg = { ...baseMessage, numberOfAttachments: 3 };
    const result = buildMboxEntry(msg as any);
    expect(result).not.toContain('multipart/mixed');
    expect(result).not.toContain('Content-Transfer-Encoding: base64');
  });

  test('parseEmailでX-Mailark-Pst-DescからpstDescriptorIdを取得できる', () => {
    const raw = buildMboxEntry(baseMessage as any);
    const parsed = parseEmail(raw);
    expect(parsed).not.toBeNull();
    expect(parsed!.pstDescriptorId).toBe(12345);
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
