import { describe, expect, it, vi } from 'vitest';
import { frameBootstrapScript } from './frameBootstrapScript.js';

function boot() {
  const posted: Array<{ message: unknown; transfer?: unknown[] }> = [];
  class FakeChannel {
    port1 = {
      postMessage: (message: unknown, transfer?: unknown[]) => posted.push({ message, transfer }),
      close() {},
      start() {},
      onmessage: null,
    };
    port2 = {};
  }
  const win: Record<string, unknown> = { addEventListener() {}, dispatchEvent() {} };
  const code = frameBootstrapScript('n1')
    .replace(/^<script>/, '')
    .replace(/<\/script>$/, '');
  const run = new Function('window', 'parent', 'MessageChannel', 'MessageEvent', 'document', code);
  const event = function () {};
  Object.defineProperty(event.prototype, 'data', { get: () => null });
  run(win, { postMessage: vi.fn() }, FakeChannel, event, { currentScript: { remove() {} } });
  return { send: win.__GDPL_DOCUMENT_SEND__ as (...args: unknown[]) => void, posted };
}

describe('frame bootstrap send', () => {
  it('forwards a transfer list so large buffers move instead of copying', () => {
    const { send, posted } = boot();
    const data = new ArrayBuffer(8);
    send({ t: 'video:export', data }, '*', [data]);
    send({ t: 'save:put' }, '*');
    send({ t: 'x' }, '*', 'not a list');
    expect(posted[0]).toEqual({
      message: { payload: { t: 'video:export', data }, documentNonce: 'n1' },
      transfer: [data],
    });
    expect(posted[1]!.transfer).toBeUndefined();
    expect(posted[2]!.transfer).toBeUndefined();
  });
});
