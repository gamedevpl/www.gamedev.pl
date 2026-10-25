import { JSDOM } from 'jsdom';
import { expect, it, vi } from 'vitest';
import { embedGameHtml } from './game-embed.js';

it('keeps responsive canvas sizing through a zero-size mount and follows body resizing', () => {
  const dom = new JSDOM(
    embedGameHtml('<html><head></head><body><canvas id="game" width="320" height="240"></canvas></body></html>'),
    { runScripts: 'outside-only' },
  );
  try {
    const win = dom.window;
    win.requestAnimationFrame = () => 1;
    win.cancelAnimationFrame = () => {};
    win.postMessage = vi.fn();
    let width = 0,
      height = 0;
    const resize: Array<() => void> = [];
    win.document.body.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      width,
      height,
      top: 0,
      left: 0,
      right: width,
      bottom: height,
      toJSON: () => ({}),
    });
    Object.assign(win, {
      ResizeObserver: class {
        constructor(private callback: () => void) {}
        observe(target: Element) {
          if (target === win.document.body) resize.push(this.callback);
        }
        disconnect() {}
      },
    });
    win.eval(win.document.querySelector('script')!.textContent!);
    win.dispatchEvent(new win.Event('DOMContentLoaded'));
    const canvas = win.document.getElementById('game')!;
    expect(canvas.style.getPropertyValue('--gdpl-embed-width')).not.toBe('0px');
    expect(canvas.style.getPropertyValue('--gdpl-embed-height')).not.toBe('0px');
    expect(resize.length).toBeGreaterThan(0);
    width = 640;
    height = 480;
    resize.forEach((callback) => callback());
    expect(canvas.style.getPropertyValue('--gdpl-embed-width')).toBe('640px');
    expect(canvas.style.getPropertyValue('--gdpl-embed-height')).toBe('480px');
    width = 0;
    height = 0;
    resize.forEach((callback) => callback());
    expect(canvas.style.getPropertyValue('--gdpl-embed-width')).toBe('640px');
  } finally {
    dom.window.close();
  }
});
