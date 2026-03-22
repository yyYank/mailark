import { describeSearchStatus } from '../searchStatus';

describe('describeSearchStatus', () => {
  test('index 構築中の進捗を表示する', () => {
    expect(describeSearchStatus({ phase: 'indexing', indexed: 25, total: 100 })).toBe('検索 index 構築中 25 / 100');
  });

  test('検索結果件数を表示する', () => {
    expect(describeSearchStatus({ phase: 'searched', query: '会議', hitCount: 3, total: 120 })).toBe('自然言語検索 3 / 120 件');
  });
});
