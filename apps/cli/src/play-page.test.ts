import { JSDOM } from 'jsdom';
import { expect, it } from 'vitest';
import { embedGameHtml } from '@gamedevpl/contract';
import { PLAY_PAGE } from './play-page.js';

it('embeds raw preview through the shared player while retaining reload controls and errors', async () => {
  let revision = 'first',
    error = '';
  const html = '<!doctype html><html><head></head><body><h1 id="game-title">Game</h1></body></html>';
  let tick: (() => Promise<void>) | undefined;
  const dom = new JSDOM(PLAY_PAGE, {
    url: 'http://localhost/preview/',
    runScripts: 'dangerously',
    beforeParse(window) {
      window.fetch = async (url: string) =>
        ({
          json: async () => ({ revision, error }),
          text: async () => html,
          url,
        }) as unknown as Response;
      window.setTimeout = ((callback: () => Promise<void>) => {
        tick = callback;
        return 1;
      }) as typeof window.setTimeout;
    },
  });
  try {
    await new Promise((resolve) => setTimeout(resolve, 0));
    const document = dom.window.document;
    const frame = document.querySelector('iframe')!;
    expect(frame.srcdoc).toBe(embedGameHtml(html));
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts allow-pointer-lock');
    expect(document.querySelector('header')).toBeNull();
    expect(document.querySelector('details')!.open).toBe(false);
    expect(document.querySelector<HTMLElement>('#error')!.hidden).toBe(true);
    document.querySelector<HTMLButtonElement>('#pause')!.click();
    revision = 'second';
    error = 'Compilation failed';
    await tick!();
    expect(document.querySelector('#status')!.textContent).toContain('paused');
    expect(document.querySelector<HTMLElement>('#error')!.hidden).toBe(false);
    expect(document.querySelector('#error')!.textContent).toBe(error);
    frame.srcdoc = 'kept build';
    await tick!();
    expect(frame.srcdoc).toBe('kept build');
    document.querySelector<HTMLButtonElement>('#pause')!.click();
    error = '';
    await tick!();
    expect(frame.srcdoc).toBe(embedGameHtml(html));
    expect(document.querySelector<HTMLElement>('#error')!.hidden).toBe(true);
  } finally {
    dom.window.close();
  }
});
