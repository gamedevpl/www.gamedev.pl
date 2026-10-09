import { JSDOM } from 'jsdom';
import { expect, it, vi } from 'vitest';
import { PLAY_PRESENCE_SCRIPT } from './play-presence-script.js';

it('retains hidden tabs, closes on pagehide and reconnects after BFCache restore', () => {
  const sockets: Array<{ close: ReturnType<typeof vi.fn>; onclose?: () => void; url: string; protocols: string[] }> =
    [];
  const dom = new JSDOM(
    `<script>const presencePath='/presence',presenceProtocols=['gamedevpl-presence','token.secret'];${PLAY_PRESENCE_SCRIPT}</script>`,
    {
      url: 'http://localhost/',
      runScripts: 'dangerously',
      beforeParse(window) {
        window.WebSocket = class {
          url: string;
          protocols: string[];
          onclose?: () => void;
          close = vi.fn(() => this.onclose?.());
          constructor(url: URL, protocols: string[]) {
            this.url = String(url);
            this.protocols = protocols;
            sockets.push(this);
          }
        } as unknown as typeof WebSocket;
      },
    },
  );
  try {
    expect(sockets).toHaveLength(1);
    dom.window.document.dispatchEvent(new dom.window.Event('visibilitychange'));
    expect(sockets[0]!.close).not.toHaveBeenCalled();
    dom.window.dispatchEvent(new dom.window.Event('pagehide'));
    expect(sockets[0]!.close).toHaveBeenCalledOnce();
    dom.window.dispatchEvent(new dom.window.Event('pageshow'));
    expect(sockets).toHaveLength(2);
    expect(sockets[1]!.close).not.toHaveBeenCalled();
    expect(sockets[1]).toMatchObject({
      url: 'ws://localhost/presence',
      protocols: ['gamedevpl-presence', 'token.secret'],
    });
  } finally {
    dom.window.dispatchEvent(new dom.window.Event('pagehide'));
    dom.window.close();
  }
});
