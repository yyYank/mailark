import { SearchDocument, SearchResult, SearchRunner, SearchTokenizer } from '../searchEngine';
import { SearchIndexManager } from '../searchIndexManager';
import { SearchStatus } from '../searchStatus';

class FakeSearchRunner implements SearchRunner {
  constructor(private readonly results: SearchResult[]) {}

  async search(): Promise<SearchResult[]> {
    return this.results;
  }
}

function createDoc(id: string): SearchDocument {
  return {
    id,
    from: `${id}@example.com`,
    to: 'team@example.com',
    subject: `subject-${id}`,
    body: `body-${id}`,
  };
}

describe('SearchIndexManager', () => {
  test('replaceAll 後の search は最新の index 構築完了を待つ', async () => {
    let resolveBuild: ((runner: SearchRunner) => void) | null = null;
    const manager = new SearchIndexManager({
      tokenizer: async () => [],
      buildIndex: async () => new Promise<SearchRunner>(resolve => {
        resolveBuild = resolve;
      }),
    });

    manager.replaceAll([createDoc('mail-1')]);
    const searchPromise = manager.search('mail-1');

    expect(resolveBuild).not.toBeNull();
    resolveBuild!(new FakeSearchRunner([{ id: 'mail-1', score: 1 }]));

    await expect(searchPromise).resolves.toEqual([{ id: 'mail-1', score: 1 }]);
  });

  test('reset が走ったら古い build 結果を採用しない', async () => {
    let resolveBuild: ((runner: SearchRunner) => void) | null = null;
    const manager = new SearchIndexManager({
      tokenizer: async () => [],
      buildIndex: async () => new Promise<SearchRunner>(resolve => {
        resolveBuild = resolve;
      }),
    });

    manager.replaceAll([createDoc('mail-1')]);
    const searchPromise = manager.search('mail-1');
    manager.reset();
    expect(resolveBuild).not.toBeNull();
    resolveBuild!(new FakeSearchRunner([{ id: 'mail-1', score: 1 }]));

    await expect(searchPromise).resolves.toEqual([]);
  });

  test('より新しい replaceAll が来たら古い build 結果を採用しない', async () => {
    const resolves: Array<(runner: SearchRunner) => void> = [];
    const docsBuilt: string[][] = [];
    const tokenizer: SearchTokenizer = async () => [];
    const manager = new SearchIndexManager({
      tokenizer,
      buildIndex: async (docs: SearchDocument[]) => {
        docsBuilt.push(docs.map(doc => doc.id));
        return new Promise<SearchRunner>(resolve => {
          resolves.push(resolve);
        });
      },
    });

    manager.replaceAll([createDoc('mail-1')]);
    manager.replaceAll([createDoc('mail-2')]);

    resolves[0](new FakeSearchRunner([{ id: 'mail-1', score: 1 }]));
    resolves[1](new FakeSearchRunner([{ id: 'mail-2', score: 2 }]));

    await expect(manager.search('mail-2')).resolves.toEqual([{ id: 'mail-2', score: 2 }]);
    expect(docsBuilt).toEqual([['mail-1'], ['mail-2']]);
  });

  test('index 構築の状態変化を通知する', async () => {
    const statuses: SearchStatus[] = [];
    const manager = new SearchIndexManager({
      tokenizer: async () => [],
      onStatusChange: status => {
        statuses.push(status);
      },
    });

    manager.replaceAll([createDoc('mail-1'), createDoc('mail-2')]);
    await manager.search('mail-1');

    expect(statuses).toContainEqual({ phase: 'indexing', indexed: 0, total: 2 });
    expect(statuses).toContainEqual({ phase: 'ready', total: 2 });
  });

  test('reset 時に idle を通知する', () => {
    const statuses: SearchStatus[] = [];
    const manager = new SearchIndexManager({
      tokenizer: async () => [],
      onStatusChange: status => {
        statuses.push(status);
      },
    });

    manager.reset();

    expect(statuses).toContainEqual({ phase: 'idle' });
  });
});
