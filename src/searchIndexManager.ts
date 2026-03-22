import { buildSearchIndex, SearchDocument, SearchResult, SearchRunner, SearchTokenizer } from './searchEngine';
import { SearchStatus } from './searchStatus';

interface SearchIndexManagerOptions {
  tokenizer: SearchTokenizer;
  buildIndex?: (
    docs: SearchDocument[],
    tokenizer: SearchTokenizer,
    onProgress?: (indexed: number, total: number) => void,
  ) => Promise<SearchRunner>;
  onStatusChange?: (status: SearchStatus) => void;
}

export class SearchIndexManager {
  private index: SearchRunner | null = null;
  private buildPromise: Promise<SearchRunner> | null = null;
  private generation = 0;
  private totalDocs = 0;

  constructor(
    private readonly options: SearchIndexManagerOptions,
  ) {}

  replaceAll(docs: SearchDocument[]): void {
    const currentGeneration = ++this.generation;
    this.index = null;
    this.totalDocs = docs.length;
    this.options.onStatusChange?.({ phase: 'indexing', indexed: 0, total: docs.length });
    this.buildPromise = this.options.buildIndex
      ? this.options.buildIndex(
        [...docs],
        this.options.tokenizer,
        (indexed, total) => {
          if (this.generation === currentGeneration) {
            this.options.onStatusChange?.({ phase: 'indexing', indexed, total });
          }
        },
      )
      : buildSearchIndex(
        [...docs],
        this.options.tokenizer,
        {
          onProgress: (indexed, total) => {
            if (this.generation === currentGeneration) {
              this.options.onStatusChange?.({ phase: 'indexing', indexed, total });
            }
          },
        },
      );

    this.buildPromise = this.buildPromise.then(createdIndex => {
      if (this.generation === currentGeneration) {
        this.index = createdIndex;
        this.options.onStatusChange?.({ phase: 'ready', total: docs.length });
      }
      return createdIndex;
    }).finally(() => {
      if (this.generation === currentGeneration) {
        this.buildPromise = null;
      }
    });
  }

  reset(): void {
    this.generation += 1;
    this.index = null;
    this.buildPromise = null;
    this.totalDocs = 0;
    this.options.onStatusChange?.({ phase: 'idle' });
  }

  async search(query: string): Promise<SearchResult[]> {
    const currentGeneration = this.generation;
    const pendingBuild = this.buildPromise;

    if (pendingBuild) {
      try {
        await pendingBuild;
      } catch {
        if (currentGeneration !== this.generation || !this.index) return [];
        throw new Error('search index build failed');
      }
    }

    if (currentGeneration !== this.generation || !this.index) return [];
    this.options.onStatusChange?.({ phase: 'searching', query, total: this.totalDocs });
    const results = await this.index.search(query);
    if (currentGeneration === this.generation) {
      this.options.onStatusChange?.({ phase: 'searched', query, hitCount: results.length, total: this.totalDocs });
    }
    return results;
  }
}
