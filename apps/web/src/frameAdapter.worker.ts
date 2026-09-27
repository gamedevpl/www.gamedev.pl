import { adaptFrameDocument } from './frameBootstrap.js';

// Parses game documents off the main thread; see frameAdapter.ts.
const scope = self as unknown as Worker;
scope.addEventListener('message', (event: MessageEvent<{ id: number; html: string }>) => {
  const { id, html } = event.data;
  try {
    scope.postMessage({ id, result: adaptFrameDocument(html) });
  } catch (error) {
    scope.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
});
