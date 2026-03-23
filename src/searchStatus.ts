export type SearchStatus =
  | { phase: 'idle' }
  | { phase: 'indexing'; indexed: number; total: number }
  | { phase: 'ready'; total: number }
  | { phase: 'searching'; query: string; total: number }
  | { phase: 'searched'; query: string; hitCount: number; total: number }
  | { phase: 'error'; message: string };

export function describeSearchStatus(status: SearchStatus): string {
  switch (status.phase) {
    case 'idle':
      return '検索 index 未構築';
    case 'indexing':
      return `検索 index 構築中 ${status.indexed} / ${status.total}`;
    case 'ready':
      return `検索 index 準備完了 ${status.total} 件`;
    case 'searching':
      return `検索中: ${status.query}`;
    case 'searched':
      return `自然言語検索 ${status.hitCount} / ${status.total} 件`;
    case 'error':
      return `検索エラー: ${status.message}`;
  }
}
