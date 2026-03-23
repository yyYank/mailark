import { extractSearchableBody } from '../searchableBody';

describe('extractSearchableBody', () => {
  test('HTML をテキスト化して検索対象本文を作る', () => {
    const body = extractSearchableBody('', '<html><body><h1>会議</h1><p>来週の予定</p></body></html>');

    expect(body).toBe('会議 来週の予定');
  });

  test('長すぎる本文は上限で切り詰める', () => {
    const longText = 'あ'.repeat(5000);

    expect(extractSearchableBody(longText, '')).toHaveLength(2000);
  });

  test('base64 っぽい長い断片は除外する', () => {
    const binaryish = `会議 ${'A'.repeat(120)} 議事録`;

    expect(extractSearchableBody(binaryish, '')).toBe('会議 議事録');
  });
});
