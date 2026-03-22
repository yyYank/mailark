import { buildSearchIndex, SearchDocument } from '../searchEngine';

async function tokenize(text: string): Promise<string[]> {
  const normalized = text
    .replace(/[。、,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return [];

  const dictionary: Record<string, string[]> = {
    '買い出し担当': ['買い出し', '担当'],
    'じゃがいもの担当': ['じゃがいも', '担当'],
    '買い出し': ['買い出し'],
    '担当': ['担当'],
    'カレーの具材候補の整理': ['カレー', '具材', '候補', '整理'],
    'じゃがいもを買う担当は中村さんでお願いします': ['じゃがいも', '買う', '担当', '中村'],
    '買い出し担当と予算の確認': ['買い出し', '担当', '予算', '確認'],
    '予算メモ': ['予算', 'メモ'],
  };

  return dictionary[normalized] || normalized.split(' ');
}

describe('buildSearchIndex', () => {
  const docs: SearchDocument[] = [
    {
      id: 'body-hit',
      from: 'emi@example.com',
      to: 'team@example.com',
      subject: '予算メモ',
      body: 'じゃがいもを買う担当は中村さんでお願いします',
    },
    {
      id: 'subject-hit',
      from: 'aki@example.com',
      to: 'team@example.com',
      subject: '買い出し担当と予算の確認',
      body: '集合時間を確認したいです',
    },
  ];

  test('日本語自然文を token 化して本文から検索できる', async () => {
    const index = await buildSearchIndex(docs, tokenize);

    const results = await index.search('じゃがいもの担当');
    const resultIds = results.map(result => result.id);

    expect(resultIds).toContain('body-hit');
  });

  test('件名ヒットを本文ヒットより高く評価する', async () => {
    const index = await buildSearchIndex(docs, tokenize);

    const results = await index.search('買い出し担当');

    expect(results[0]?.id).toBe('subject-hit');
  });

  test('from/to は kuromoji を使わずに検索 index を作る', async () => {
    const tokenizeCalls: string[] = [];
    const index = await buildSearchIndex([
      {
        id: 'mail-1',
        from: 'emi@example.com',
        to: 'team@example.com',
        subject: '件名',
        body: '本文',
      },
    ], async text => {
      tokenizeCalls.push(text);
      return text.split(/\s+/).filter(Boolean);
    });

    const results = await index.search('emi example com');

    expect(results[0]?.id).toBe('mail-1');
    expect(tokenizeCalls).not.toContain('emi@example.com');
    expect(tokenizeCalls).not.toContain('team@example.com');
  });

  test('同じ件名と本文では token 化結果を使い回す', async () => {
    const tokenizeCalls: string[] = [];

    await buildSearchIndex([
      {
        id: 'mail-1',
        from: 'a@example.com',
        to: 'team@example.com',
        subject: '進捗共有',
        body: '今週の進捗共有です',
      },
      {
        id: 'mail-2',
        from: 'b@example.com',
        to: 'team@example.com',
        subject: '進捗共有',
        body: '今週の進捗共有です',
      },
    ], async text => {
      tokenizeCalls.push(text);
      return text.split(/\s+/).filter(Boolean);
    });

    expect(tokenizeCalls).toEqual(['進捗共有', '今週の進捗共有です']);
  });
});
