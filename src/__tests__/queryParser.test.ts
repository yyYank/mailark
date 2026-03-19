import { parseSearchQuery, parseQueryDate } from '../queryParser';

// ─── parseQueryDate ──────────────────────────────────────────────────────────

describe('parseQueryDate', () => {
  test('YYYY-MM-DD形式をその日の開始タイムスタンプに変換できる', () => {
    const ts = parseQueryDate('2022-12-31');
    expect(ts).toBe(new Date(2022, 11, 31).getTime());
  });

  test('YYYY-M-D形式（ゼロ埋めなし）でも変換できる', () => {
    const ts = parseQueryDate('2022-1-5');
    expect(ts).toBe(new Date(2022, 0, 5).getTime());
  });

  test('不正なフォーマットはnullを返す', () => {
    expect(parseQueryDate('2022/12/31')).toBeNull();
    expect(parseQueryDate('not-a-date')).toBeNull();
    expect(parseQueryDate('')).toBeNull();
  });

  test('存在しない日付はnullを返す', () => {
    expect(parseQueryDate('2022-13-01')).toBeNull();
    expect(parseQueryDate('2022-02-30')).toBeNull();
  });
});

// ─── parseSearchQuery ────────────────────────────────────────────────────────

describe('parseSearchQuery', () => {
  test('空クエリはtextが空でフィルタなしになる', () => {
    const result = parseSearchQuery('');
    expect(result.text).toBe('');
    expect(result.from).toBeUndefined();
    expect(result.to).toBeUndefined();
    expect(result.since).toBeUndefined();
    expect(result.until).toBeUndefined();
  });

  test('修飾子なしのテキストはそのままtextに入る', () => {
    const result = parseSearchQuery('会議 議事録');
    expect(result.text).toBe('会議 議事録');
    expect(result.from).toBeUndefined();
  });

  test('from:を抽出できる', () => {
    const result = parseSearchQuery('from:hoge@gmail.com');
    expect(result.from).toBe('hoge@gmail.com');
    expect(result.text).toBe('');
  });

  test('to:を抽出できる', () => {
    const result = parseSearchQuery('to:recipient@example.com');
    expect(result.to).toBe('recipient@example.com');
    expect(result.text).toBe('');
  });

  test('since:をタイムスタンプに変換できる（その日の開始）', () => {
    const result = parseSearchQuery('since:2022-1-1');
    expect(result.since).toBe(new Date(2022, 0, 1).getTime());
  });

  test('until:をタイムスタンプに変換できる（その日の終わり）', () => {
    const result = parseSearchQuery('until:2022-12-31');
    const endOfDay = new Date(2022, 11, 31).getTime() + 24 * 60 * 60 * 1000 - 1;
    expect(result.until).toBe(endOfDay);
  });

  test('修飾子は大文字小文字を区別しない', () => {
    const result = parseSearchQuery('FROM:hoge@gmail.com SINCE:2022-1-1');
    expect(result.from).toBe('hoge@gmail.com');
    expect(result.since).toBe(new Date(2022, 0, 1).getTime());
  });

  test('複合クエリを正しく分解できる', () => {
    const result = parseSearchQuery('from:hoge@gmail.com since:2022-1-1 until:2022-12-31');
    expect(result.from).toBe('hoge@gmail.com');
    expect(result.since).toBe(new Date(2022, 0, 1).getTime());
    const endOfDay = new Date(2022, 11, 31).getTime() + 24 * 60 * 60 * 1000 - 1;
    expect(result.until).toBe(endOfDay);
    expect(result.text).toBe('');
  });

  test('修飾子とフリーテキストが混在するクエリを分解できる', () => {
    const result = parseSearchQuery('from:hoge@gmail.com 会議');
    expect(result.from).toBe('hoge@gmail.com');
    expect(result.text).toBe('会議');
  });

  test('無効な日付のsince:はフィルタとして扱われずtextに残る', () => {
    const result = parseSearchQuery('since:not-a-date');
    expect(result.since).toBeUndefined();
    expect(result.text).toBe('since:not-a-date');
  });

  test('from:はドメイン部分一致を想定した値をそのまま保持する', () => {
    const result = parseSearchQuery('from:gmail.com');
    expect(result.from).toBe('gmail.com');
  });
});
