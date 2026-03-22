import { createLazySearchIndex } from '../lazySearchIndex';
import { SearchDocument, SearchResult, SearchRunner } from '../searchEngine';

class FakeSearchIndex implements SearchRunner {
  constructor(private readonly results: SearchResult[]) {}

  async search(): Promise<SearchResult[]> {
    return this.results;
  }
}

describe('createLazySearchIndex', () => {
  test('検索が走るまで index を構築しない', async () => {
    const docs: SearchDocument[] = [];
    let buildCount = 0;
    const lazyIndex = createLazySearchIndex({
      tokenizer: async () => [],
      buildIndex: async (buildDocs) => {
        buildCount += 1;
        docs.push(...buildDocs);
        return new FakeSearchIndex([]);
      },
    });

    lazyIndex.add({
      id: 'mail-1',
      from: 'a@example.com',
      to: 'b@example.com',
      subject: '件名',
      body: '本文',
    });

    expect(buildCount).toBe(0);
    expect(lazyIndex.size()).toBe(1);

    await lazyIndex.search('本文');

    expect(buildCount).toBe(1);
    expect(docs).toHaveLength(1);
  });

  test('2回目以降の検索では index を再構築しない', async () => {
    let buildCount = 0;
    const lazyIndex = createLazySearchIndex({
      tokenizer: async () => [],
      buildIndex: async () => {
        buildCount += 1;
        return new FakeSearchIndex([{ id: 'mail-1', score: 1 }]);
      },
    });

    lazyIndex.add({
      id: 'mail-1',
      from: 'a@example.com',
      to: 'b@example.com',
      subject: '件名',
      body: '本文',
    });

    await lazyIndex.search('本文');
    await lazyIndex.search('件名');

    expect(buildCount).toBe(1);
  });

  test('並列検索でも index 構築は1回だけにする', async () => {
    let buildCount = 0;
    const lazyIndex = createLazySearchIndex({
      tokenizer: async () => [],
      buildIndex: async () => {
        buildCount += 1;
        await new Promise(resolve => setTimeout(resolve, 10));
        return new FakeSearchIndex([{ id: 'mail-1', score: 1 }]);
      },
    });

    lazyIndex.add({
      id: 'mail-1',
      from: 'a@example.com',
      to: 'b@example.com',
      subject: '件名',
      body: '本文',
    });

    await Promise.all([
      lazyIndex.search('本文'),
      lazyIndex.search('件名'),
    ]);

    expect(buildCount).toBe(1);
  });
});
