import { afterEach, describe, expect, it, vi } from 'vitest';
import { adaptFrameDocument, withFrameDocument } from './frameBootstrap.js';
import { adaptFrameDocumentLater, adaptFrameDocumentNow } from './frameAdapter.js';
import { insertFrameBootstrap } from './frameBootstrapScript.js';

const game = (id: string) =>
  `<!doctype html><html><head></head><body><script>parent.postMessage('${id}','*')</script></body></html>`;

describe('frame document adapter', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('splices a fresh bootstrap into one cached adaptation per load', () => {
    const adapted = adaptFrameDocument(game('a'));
    const first = insertFrameBootstrap(adapted, 'one');
    const second = insertFrameBootstrap(adapted, 'two');
    expect(first).toContain('"one"');
    expect(second).toContain('"two"');
    expect(first).not.toContain(adapted.marker);
    expect(first.indexOf('new MessageChannel()')).toBeLessThan(first.indexOf("__GDPL_DOCUMENT_SEND__('a'"));
    expect(withFrameDocument(game('a'), 'one')).toContain('"one"');
  });

  it('never splices at a marker the game itself supplied', () => {
    const hostile = game('b').replace('<body>', '<body><!--__GDPL_BOOTSTRAP_frame_-->');
    const html = insertFrameBootstrap(adaptFrameDocument(hostile), 'n');
    expect(html.indexOf('new MessageChannel()')).toBeLessThan(html.indexOf('<body>'));
  });

  it('adapts scripts whose type differs only in case or parameters', () => {
    const html = withFrameDocument(
      `<head></head><script type="Text/JavaScript; charset=utf-8">parent.postMessage(1,'*')</script>`,
      'n',
    );
    expect(html).toContain("window.__GDPL_DOCUMENT_SEND__(1,'*')");
  });

  it('adapts inline in tests and serves repeats from the cache', async () => {
    const now = adaptFrameDocumentNow(game('c'));
    expect(now?.html).toContain("__GDPL_DOCUMENT_SEND__('c'");
    expect(adaptFrameDocumentNow(game('c'))).toBe(now);
    await expect(adaptFrameDocumentLater(game('c'))).resolves.toBe(now);
  });

  it('defers to a worker and falls back inline when it cannot start', async () => {
    class BrokenWorker {
      onerror: ((event: { preventDefault(): void }) => void) | null = null;
      onmessage = null;
      terminate() {}
      postMessage() {
        queueMicrotask(() => this.onerror?.({ preventDefault() {} }));
      }
    }
    vi.stubGlobal('Worker', BrokenWorker);
    expect(adaptFrameDocumentNow(game('d'))).toBeNull();
    const later = await adaptFrameDocumentLater(game('d'));
    expect(later.html).toContain("__GDPL_DOCUMENT_SEND__('d'");
    expect(adaptFrameDocumentNow(game('d'))).toBe(later);
  });
});
