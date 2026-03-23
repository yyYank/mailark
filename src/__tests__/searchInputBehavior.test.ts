import { shouldSubmitSearch } from '../searchInputBehavior';

describe('shouldSubmitSearch', () => {
  test('Enter キーでのみ検索を送信する', () => {
    expect(shouldSubmitSearch('Enter', false)).toBe(true);
    expect(shouldSubmitSearch('a', false)).toBe(false);
  });

  test('IME 変換中の Enter では検索を送信しない', () => {
    expect(shouldSubmitSearch('Enter', true)).toBe(false);
  });
});
