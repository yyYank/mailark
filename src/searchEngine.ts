import MiniSearch from 'minisearch';

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

export async function buildSearchIndex(
  docs: SearchDocument[],
  tokenizer: SearchTokenizer,
): Promise<SearchIndex> {
  const miniSearch = new MiniSearch<IndexedSearchDocument>({
    fields: [...INDEX_FIELDS],
    storeFields: ['id'],
    tokenize: text => text.split(' ').filter(Boolean),
    processTerm: term => term,
  });

  const indexedDocs = await Promise.all(docs.map(async doc => ({
    ...doc,
    fromTerms: (await tokenizer(doc.from)).join(' '),
    toTerms: (await tokenizer(doc.to)).join(' '),
    subjectTerms: (await tokenizer(doc.subject)).join(' '),
    bodyTerms: (await tokenizer(doc.body)).join(' '),
  })));

  miniSearch.addAll(indexedDocs);
  return new SearchIndex(miniSearch, tokenizer);
}
