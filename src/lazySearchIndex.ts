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
  // reset() が呼ばれるたびにインクリメントし、古い buildPromise の結果を破棄する
  let generation = 0;

  return {
    add(doc: SearchDocument) {
      docs.push(doc);
    },
    reset() {
      generation++;
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
    const currentGeneration = generation;
    if (!buildPromise) {
      buildPromise = buildIndex([...docs], tokenizer).then(createdIndex => {
        // reset() が呼ばれた場合（世代が変わった場合）は古いインデックスを捨てる
        if (generation === currentGeneration) {
          index = createdIndex;
        }
        return createdIndex;
      }).finally(() => {
        if (generation === currentGeneration) {
          buildPromise = null;
        }
      });
    }
    return buildPromise;
  }
}
