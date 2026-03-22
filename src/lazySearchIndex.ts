import { buildSearchIndex, SearchDocument, SearchResult, SearchRunner, SearchTokenizer } from './searchEngine';

interface LazySearchIndexOptions {
  tokenizer: SearchTokenizer;
  buildIndex?: (docs: SearchDocument[], tokenizer: SearchTokenizer) => Promise<SearchRunner>;
}

export interface LazySearchIndex {
  add(doc: SearchDocument): void;
  reset(): void;
  search(query: string): Promise<SearchResult[]>;
  size(): number;
}

export function createLazySearchIndex({
  tokenizer,
  buildIndex = buildSearchIndex,
}: LazySearchIndexOptions): LazySearchIndex {
  const docs: SearchDocument[] = [];
  let index: SearchRunner | null = null;
  let buildPromise: Promise<SearchRunner> | null = null;

  return {
    add(doc: SearchDocument) {
      docs.push(doc);
    },
    reset() {
      docs.length = 0;
      index = null;
      buildPromise = null;
    },
    size() {
      return docs.length;
    },
    async search(query: string) {
      const searchIndex = await ensureIndex();
      return searchIndex.search(query);
    },
  };

  async function ensureIndex(): Promise<SearchRunner> {
    if (index) return index;
    if (!buildPromise) {
      buildPromise = buildIndex([...docs], tokenizer).then(createdIndex => {
        index = createdIndex;
        return createdIndex;
      }).finally(() => {
        buildPromise = null;
      });
    }
    return buildPromise;
  }
}
