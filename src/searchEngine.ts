import MiniSearch from 'minisearch';
import { normalizeSearchText } from './searchTokenizer';

export interface SearchDocument {
  id: string;
  from: string;
  to: string;
  subject: string;
  body: string;
}

export interface SearchResult {
  id: string;
  score: number;
}

export type SearchTokenizer = (text: string) => Promise<string[]>;

interface BuildSearchIndexOptions {
  onProgress?: (indexed: number, total: number) => void;
}

export interface SearchRunner {
  search(query: string): Promise<SearchResult[]>;
}

interface IndexedSearchDocument {
  id: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  fromTerms: string;
  toTerms: string;
  subjectTerms: string;
  bodyTerms: string;
}

const INDEX_FIELDS = ['fromTerms', 'toTerms', 'subjectTerms', 'bodyTerms'] as const;

export class SearchIndex implements SearchRunner {
  constructor(
    private readonly miniSearch: MiniSearch<IndexedSearchDocument>,
    private readonly tokenizer: SearchTokenizer,
  ) {}

  async search(query: string): Promise<SearchResult[]> {
    const terms = await this.tokenizer(query);
    if (terms.length === 0) return [];

    return this.miniSearch.search(terms.join(' '), {
      combineWith: 'AND',
      prefix: (term, index) => index === terms.length - 1 && term.length >= 2,
      fuzzy: (term) => term.length >= 4 ? 0.2 : false,
      boost: {
        subjectTerms: 5,
        fromTerms: 3,
        toTerms: 2,
        bodyTerms: 1,
      },
      tokenize: text => text.split(' ').filter(Boolean),
    }).map(result => ({
      id: String(result.id),
      score: result.score,
    }));
  }
}

// 一度に処理するドキュメント数。全件並列だとメモリ/CPUを大量消費するためチャンク分割する
const TOKENIZE_CHUNK_SIZE = 100;

export async function buildSearchIndex(
  docs: SearchDocument[],
  tokenizer: SearchTokenizer,
  options: BuildSearchIndexOptions = {},
): Promise<SearchIndex> {
  const miniSearch = new MiniSearch<IndexedSearchDocument>({
    fields: [...INDEX_FIELDS],
    storeFields: ['id'],
    tokenize: text => text.split(' ').filter(Boolean),
    processTerm: term => term,
  });

  options.onProgress?.(0, docs.length);
  const tokenCache = new Map<string, Promise<string[]>>();

  for (let i = 0; i < docs.length; i += TOKENIZE_CHUNK_SIZE) {
    const chunk = docs.slice(i, i + TOKENIZE_CHUNK_SIZE);
    const indexedChunk: IndexedSearchDocument[] = [];

    for (const [chunkIndex, doc] of chunk.entries()) {
      indexedChunk.push({
        ...doc,
        fromTerms: tokenizeAddressField(doc.from).join(' '),
        toTerms: tokenizeAddressField(doc.to).join(' '),
        subjectTerms: (await cachedTokenize(doc.subject, tokenizer, tokenCache)).join(' '),
        bodyTerms: (await cachedTokenize(doc.body, tokenizer, tokenCache)).join(' '),
      });
      options.onProgress?.(Math.min(i + chunkIndex + 1, docs.length), docs.length);
    }

    miniSearch.addAll(indexedChunk);
  }

  return new SearchIndex(miniSearch, tokenizer);
}

function tokenizeAddressField(text: string): string[] {
  return normalizeSearchText(text).split(' ').filter(Boolean);
}

async function cachedTokenize(
  text: string,
  tokenizer: SearchTokenizer,
  cache: Map<string, Promise<string[]>>,
): Promise<string[]> {
  const normalized = text.trim();
  const cached = cache.get(normalized);
  if (cached) return cached;

  const promise = tokenizer(text);
  cache.set(normalized, promise);
  return promise;
}
