import * as path from 'path';
import { Worker } from 'worker_threads';
import { SearchDocument, SearchResult } from './searchEngine';
import { SearchWorkerRequest, SearchWorkerResponse } from './searchWorkerProtocol';
import { SearchStatus } from './searchStatus';

export interface BackgroundSearchIndex {
  replaceAll(docs: SearchDocument[]): void;
  reset(): void;
  search(query: string): Promise<SearchResult[]>;
}

interface BackgroundSearchIndexOptions {
  onStatusChange?: (status: SearchStatus) => void;
}

interface PendingRequest {
  resolve: (value: null | SearchResult[]) => void;
  reject: (reason?: unknown) => void;
}

export function createBackgroundSearchIndex(
  options: BackgroundSearchIndexOptions = {},
): BackgroundSearchIndex {
  const worker = new Worker(path.join(__dirname, 'searchWorker.js'));
  const pendingRequests = new Map<number, PendingRequest>();
  let nextId = 1;

  worker.on('message', (message: SearchWorkerResponse) => {
    if (message.kind === 'status') {
      options.onStatusChange?.(message.status);
      return;
    }

    const pending = pendingRequests.get(message.id);
    if (!pending) return;
    pendingRequests.delete(message.id);

    if (message.ok) {
      pending.resolve(message.result);
      return;
    }

    pending.reject(new Error(message.error));
  });

  worker.on('error', err => {
    for (const pending of pendingRequests.values()) {
      pending.reject(err);
    }
    pendingRequests.clear();
  });

  return {
    replaceAll(docs: SearchDocument[]) {
      void send('replaceAll', { docs }).catch(err => {
        console.error('[backgroundSearchIndex] replaceAll failed:', err);
      });
    },
    reset() {
      void send('reset', {}).catch(err => {
        console.error('[backgroundSearchIndex] reset failed:', err);
      });
    },
    async search(query: string) {
      const result = await send('search', { query });
      return result || [];
    },
  };

  function send(
    type: SearchWorkerRequest['type'],
    payload: Pick<SearchWorkerRequest, 'docs' | 'query'>,
  ): Promise<null | SearchResult[]> {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pendingRequests.set(id, { resolve, reject });
      worker.postMessage({ id, type, ...payload } satisfies SearchWorkerRequest);
    });
  }
}
