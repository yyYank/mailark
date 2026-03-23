import { parentPort } from 'worker_threads';
import { tokenizeJapaneseText } from './searchTokenizer';
import { SearchIndexManager } from './searchIndexManager';
import { SearchWorkerRequest, SearchWorkerResponse } from './searchWorkerProtocol';

const manager = new SearchIndexManager({
  tokenizer: tokenizeJapaneseText,
  onStatusChange: status => {
    respond({ kind: 'status', status });
  },
});

if (!parentPort) {
  throw new Error('searchWorker requires parentPort');
}

parentPort.on('message', (message: SearchWorkerRequest) => {
  void handleMessage(message);
});

async function handleMessage(message: SearchWorkerRequest): Promise<void> {
  try {
    if (message.type === 'reset') {
      manager.reset();
      respond({ kind: 'response', id: message.id, ok: true, result: null });
      return;
    }

    if (message.type === 'replaceAll') {
      manager.replaceAll(message.docs || []);
      respond({ kind: 'response', id: message.id, ok: true, result: null });
      return;
    }

    if (message.type === 'search') {
      const results = await manager.search(message.query || '');
      respond({ kind: 'response', id: message.id, ok: true, result: results });
      return;
    }

    respond({ kind: 'response', id: message.id, ok: false, error: `Unknown message type: ${String(message.type)}` });
  } catch (err) {
    respond({
      kind: 'response',
      id: message.id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

function respond(message: SearchWorkerResponse): void {
  parentPort!.postMessage(message);
}
