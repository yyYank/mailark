import { SearchDocument, SearchResult } from './searchEngine';
import { SearchStatus } from './searchStatus';

export interface SearchWorkerRequest {
  id: number;
  type: 'replaceAll' | 'reset' | 'search';
  docs?: SearchDocument[];
  query?: string;
}

export interface SearchWorkerSuccessResponse {
  kind: 'response';
  id: number;
  ok: true;
  result: null | SearchResult[];
}

export interface SearchWorkerErrorResponse {
  kind: 'response';
  id: number;
  ok: false;
  error: string;
}

export interface SearchWorkerStatusEvent {
  kind: 'status';
  status: SearchStatus;
}

export type SearchWorkerResponse =
  | SearchWorkerSuccessResponse
  | SearchWorkerErrorResponse
  | SearchWorkerStatusEvent;
