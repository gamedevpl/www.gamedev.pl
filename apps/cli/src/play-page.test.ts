import { JSDOM } from 'jsdom';
import { expect, it, vi } from 'vitest';
import { embedGameHtml } from '@gamedevpl/contract';
import { PLAY_PAGE, renderPlayPage } from './play-page.js';

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
          ok: true,
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
    expect(document.querySelector<HTMLElement>('#loading')!.hidden).toBe(true);
    document.querySelector<HTMLButtonElement>('#sound')!.click();
    expect(document.querySelector('#sound')!.getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelector('#sound-label')!.textContent).toBe('Sound off');
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

it('shows a ready build immediately without waiting for status or exposing its HTML to the parent', async () => {
  const html =
    '<!doctype html><html><head></head><body><script>parent.document.body.dataset.escaped="yes";</script><p>$&</p></body></html>';
  const fetch = vi.fn(() => new Promise<Response>(() => undefined));
  const dom = new JSDOM(renderPlayPage({ revision: 'ready', html, error: '', busy: false }), {
    url: 'http://localhost/',
    runScripts: 'dangerously',
    beforeParse(window) {
      window.fetch = fetch;
    },
  });
  try {
    const document = dom.window.document;
    expect(document.querySelector('iframe')!.srcdoc).toBe(embedGameHtml(html));
    expect(document.body.dataset.escaped).toBeUndefined();
    expect(document.querySelector('#preview-bootstrap')).toBeNull();
    expect(document.querySelector<HTMLElement>('#loading')!.hidden).toBe(true);
    expect(fetch.mock.calls).toEqual([['/status', { cache: 'no-store' }]]);
    const menu = document.querySelector('details')!;
    menu.open = true;
    dom.window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape' }));
    expect(menu.open).toBe(false);
    expect(document.activeElement).toBe(menu.querySelector('summary'));
  } finally {
    dom.window.close();
  }
});

it('keeps a useful loading state through disconnection, first-build errors and recovery', async () => {
  let disconnected = true,
    revision = '',
    error = '';
  let tick: (() => Promise<void>) | undefined;
  const dom = new JSDOM(PLAY_PAGE, {
    url: 'http://localhost/',
    runScripts: 'dangerously',
    beforeParse(window) {
      window.fetch = async () => {
        if (disconnected) throw new Error('Disconnected');
        return { ok: true, json: async () => ({ revision, error }), text: async () => '<h1>Ready</h1>' } as Response;
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
    expect(document.querySelector<HTMLElement>('#loading')!.hidden).toBe(false);
    expect(document.querySelector('#loading-title')!.textContent).toBe('Waiting for preview');
    disconnected = false;
    error = 'Compilation failed';
    await tick!();
    expect(document.querySelector('#loading-title')!.textContent).toBe('Your game needs a fix');
    expect(document.querySelector('#error')!.textContent).toBe(error);
    revision = 'recovered';
    error = '';
    await tick!();
    expect(document.querySelector<HTMLElement>('#loading')!.hidden).toBe(true);
    expect(document.querySelector<HTMLElement>('#error')!.hidden).toBe(true);
    expect(document.querySelector('iframe')!.srcdoc).toContain('<h1>Ready</h1>');
  } finally {
    dom.window.close();
  }
});
