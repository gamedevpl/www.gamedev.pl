import type { AdaptedFrameDocument } from './frameBootstrapScript.js';

type Waiter = { resolve: (value: AdaptedFrameDocument) => void; reject: (error: Error) => void };
let worker: Worker | null = null;
let sequence = 0;
const waiters = new Map<number, Waiter>();

function startWorker(): Worker {
  const started = new Worker(new URL('./frameAdapter.worker.ts', import.meta.url), { type: 'module' });
  started.onmessage = (event: MessageEvent<{ id: number; result?: AdaptedFrameDocument; error?: string }>) => {
    const waiter = waiters.get(event.data.id);
    if (!waiter) return;
    waiters.delete(event.data.id);
    if (event.data.result) waiter.resolve(event.data.result);
    else waiter.reject(new Error(event.data.error ?? 'frame adapter failed'));
  };
  started.onerror = (event) => {
    // A worker that cannot start fails every waiter; callers fall back inline.
    event.preventDefault();
    started.terminate();
    if (worker === started) worker = null;
    for (const waiter of waiters.values()) waiter.reject(new Error('frame adapter worker failed'));
    waiters.clear();
  };
  return started;
}

export function adaptInWorker(html: string): Promise<AdaptedFrameDocument> {
  worker ??= startWorker();
  const id = ++sequence;
  const target = worker;
  return new Promise((resolve, reject) => {
    waiters.set(id, { resolve, reject });
    target.postMessage({ id, html });
  });
}
