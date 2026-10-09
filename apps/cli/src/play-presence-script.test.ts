import { JSDOM } from 'jsdom';
import { expect, it, vi } from 'vitest';
import { PLAY_PRESENCE_SCRIPT } from './play-presence-script.js';

it('retains hidden tabs, aborts on pagehide and reconnects after BFCache restore', async () => {
  const pending: Array<{ signal: AbortSignal; release: () => void }> = [];
  const dom = new JSDOM(
    `<script>const presencePath='/presence',presenceHeaders={Authorization:'Bearer secret'};${PLAY_PRESENCE_SCRIPT}</script>`,
    {
      url: 'http://localhost/',
      runScripts: 'dangerously',
      beforeParse(window) {
        window.fetch = vi.fn(async (_url: string, options: RequestInit) => ({
          ok: true,
          body: {
            getReader: () => ({
              read: () =>
                new Promise((resolve) => {
                  const release = () => resolve({ done: true });
                  pending.push({ signal: options.signal!, release });
                  options.signal!.addEventListener('abort', release, { once: true });
                }),
              cancel: async () => {},
            }),
          },
        })) as unknown as typeof fetch;
      },
    },
  );
  try {
    await vi.waitFor(() => expect(pending).toHaveLength(1));
    dom.window.document.dispatchEvent(new dom.window.Event('visibilitychange'));
    expect(pending[0]!.signal.aborted).toBe(false);
    dom.window.dispatchEvent(new dom.window.Event('pagehide'));
    expect(pending[0]!.signal.aborted).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    dom.window.dispatchEvent(new dom.window.Event('pageshow'));
    await vi.waitFor(() => expect(pending).toHaveLength(2));
    expect(pending[1]!.signal.aborted).toBe(false);
    expect(dom.window.fetch).toHaveBeenCalledWith(
      '/presence',
      expect.objectContaining({ headers: { Authorization: 'Bearer secret' } }),
    );
  } finally {
    dom.window.dispatchEvent(new dom.window.Event('pagehide'));
    dom.window.close();
  }
});
