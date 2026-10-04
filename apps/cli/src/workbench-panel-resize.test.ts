import { JSDOM } from 'jsdom';
import { afterEach, expect, it, vi } from 'vitest';
import { PLAY_STYLE } from './generated/play-ui.js';
import { SESSION_BROWSER_PAGE } from './session-browser-page.js';

const windows: JSDOM[] = [];
afterEach(() => {
  for (const dom of windows.splice(0)) dom.window.close();
});
function fixture(savedWidth?: string) {
  const dom = new JSDOM(SESSION_BROWSER_PAGE, {
    url: 'http://localhost/#' + 'a'.repeat(64),
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.fetch = vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })) as unknown as typeof fetch;
      window.AbortSignal.timeout = (() => new window.AbortController().signal) as typeof AbortSignal.timeout;
      if (savedWidth) window.localStorage.setItem('play-panel-width', savedWidth);
    },
  });
  windows.push(dom);
  const doc = dom.window.document;
  const handle = doc.getElementById('panel-resize')!;
  const width = () => doc.body.style.getPropertyValue('--panel-width');
  const pointer = (type: string, clientX: number) =>
    handle.dispatchEvent(new dom.window.MouseEvent(type, { clientX, button: 0, bubbles: true, cancelable: true }));
  const key = (name: string) =>
    handle.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }));
  return { dom, doc, handle, width, pointer, key };
}

it('exposes the default width and the viewport-limited maximum on a fresh session', () => {
  const { dom, handle, width } = fixture();
  expect(width()).toBe('');
  expect(handle.getAttribute('role')).toBe('separator');
  expect(handle.getAttribute('aria-valuenow')).toBe('390');
  expect(handle.getAttribute('aria-valuemax')).toBe(String(Math.min(900, dom.window.innerWidth - 24)));
});

it('drags toward the game to widen the right-docked panel and keeps the width', () => {
  const { dom, handle, width, pointer } = fixture();
  pointer('pointerdown', 600);
  expect(dom.window.document.body.dataset.resizing).toBe('true');
  pointer('pointermove', 500);
  pointer('pointerup', 500);
  expect(dom.window.document.body.dataset.resizing).toBeUndefined();
  expect(width()).toBe('490px');
  expect(handle.getAttribute('aria-valuenow')).toBe('490');
  expect(dom.window.localStorage.getItem('play-panel-width')).toBe('490');
});

it('reverses the drag direction when the panel is docked left and clamps to the bounds', () => {
  const { doc, width, pointer } = fixture();
  (doc.getElementById('dock') as HTMLButtonElement).click();
  pointer('pointerdown', 100);
  pointer('pointermove', 5000);
  expect(width()).toBe(Math.min(900, doc.defaultView!.innerWidth - 24) + 'px');
  pointer('pointermove', -5000);
  pointer('pointerup', -5000);
  expect(width()).toBe('300px');
});

it('restores a saved width, resizes with arrow keys and resets on double-click', () => {
  const { dom, handle, width, key } = fixture('600');
  expect(width()).toBe('600px');
  key('ArrowLeft');
  expect(width()).toBe('624px');
  key('ArrowRight');
  key('ArrowRight');
  expect(width()).toBe('576px');
  handle.dispatchEvent(new dom.window.MouseEvent('dblclick', { bubbles: true }));
  expect(width()).toBe('');
  expect(handle.getAttribute('aria-valuenow')).toBe('390');
  expect(dom.window.localStorage.getItem('play-panel-width')).toBeNull();
});

it('uses the stored width in CSS and hides the handle on narrow screens', () => {
  expect(PLAY_STYLE).toMatch(/width: ?min\(var\(--panel-width, ?390px\), ?calc\(100vw - 24px\)\)/);
  expect(PLAY_STYLE).toMatch(/@media ?\(max-width: ?600px\) ?\{ ?#panel-resize ?\{ ?display: ?none/);
});
