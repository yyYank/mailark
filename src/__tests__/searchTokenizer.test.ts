import { tokenizeJapaneseText, normalizeSearchText } from '../searchTokenizer';

describe('normalizeSearchText', () => {
  test('全角英数字をASCIIに正規化する', () => {
    expect(normalizeSearchText('Ａｂｃ１２３')).toBe('abc123');
  });

  test('URLをスペースに置き換える', () => {
    const result = normalizeSearchText('詳細は https://example.com を参照');
    expect(result).not.toContain('https://');
    expect(result).toContain('詳細');
    expect(result).toContain('参照');
  });

  test('記号をスペースに変換する', () => {
    expect(normalizeSearchText('hello-world')).toBe('hello world');
  });

  test('空文字列は空文字列を返す', () => {
    expect(normalizeSearchText('')).toBe('');
  });

  test('連続スペースを1つに正規化する', () => {
    expect(normalizeSearchText('a   b')).toBe('a b');
  });
});

describe('tokenizeJapaneseText', () => {
  // kuromoji の辞書ロードを伴うため timeout を長めに設定
  const TIMEOUT = 15000;

  test('名詞が抽出される', async () => {
    const tokens = await tokenizeJapaneseText('東京の桜');
    expect(tokens).toContain('東京');
    expect(tokens).toContain('桜');
  }, TIMEOUT);

  test('助詞が除去される', async () => {
    const tokens = await tokenizeJapaneseText('東京の桜');
    expect(tokens).not.toContain('の');
  }, TIMEOUT);

  test('動詞の surface または basic_form が含まれる', async () => {
    const tokens = await tokenizeJapaneseText('メールを送った');
    // surface_form「送っ」または basic_form「送る」のいずれかが含まれる
    const hasVerb = tokens.some(t => t.startsWith('送'));
    expect(hasVerb).toBe(true);
  }, TIMEOUT);

  test('空文字列は空配列を返す', async () => {
    const tokens = await tokenizeJapaneseText('');
    expect(tokens).toEqual([]);
  }, TIMEOUT);

  test('記号のみの文字列は空配列を返す', async () => {
    const tokens = await tokenizeJapaneseText('---');
    expect(tokens).toEqual([]);
  }, TIMEOUT);
});
