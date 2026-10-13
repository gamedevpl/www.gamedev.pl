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
        new Response(url.endsWith('status') ? JSON.stringify({ revision, error }) : html, {
          headers: { 'content-type': url.endsWith('status') ? 'application/json' : 'text/plain' },
        });
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

it.each([
  ['status', 403, 'application/json', 'HTTP 403'],
  ['game', 403, 'text/html', 'HTTP 403'],
  ['game', 200, 'text/html', 'unexpected response'],
])('keeps the last game when %s returns %s with %s', async (endpoint, code, type, message) => {
  let revision = 'first',
    failed = false;
  let tick: (() => Promise<void>) | undefined;
  const html = '<!doctype html><html><head></head><body><canvas></canvas></body></html>';
  const dom = new JSDOM(PLAY_PAGE, {
    url: 'https://space-3000.app.github.dev/preview/',
    runScripts: 'dangerously',
    beforeParse(window) {
      window.fetch = async (url: string) => {
        if (failed && url.endsWith(endpoint))
          return new Response('<h1>Access denied</h1>', {
            status: code,
            headers: { 'content-type': type },
          });
        return new Response(url.endsWith('status') ? JSON.stringify({ revision, error: '' }) : html, {
          headers: { 'content-type': url.endsWith('status') ? 'application/json' : 'text/plain' },
        });
      };
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
    revision = 'second';
    failed = true;
    await tick!();
    expect(frame.srcdoc).toBe(embedGameHtml(html));
    expect(document.querySelector('#status')!.textContent).toContain('disconnected');
    expect(document.querySelector<HTMLElement>('#error')!.hidden).toBe(false);
    expect(document.querySelector('#error')!.textContent).toContain(message);
    failed = false;
    await tick!();
    expect(frame.srcdoc).toBe(embedGameHtml(html));
    expect(document.querySelector<HTMLElement>('#error')!.hidden).toBe(true);
  } finally {
    dom.window.close();
  }
});
