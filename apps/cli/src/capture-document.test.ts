import { createServer } from 'node:http';
import { once } from 'node:events';
import { JSDOM } from 'jsdom';
import { PNG } from 'pngjs';
import { expect, it } from 'vitest';
import { captureGameDocument, capturePage, CAPTURE_CSP } from './local-preview-source.js';
import { captureBrowser } from './local-capture-browser.js';

it.each([
  '<!doctype html><!-- <head> --><body><script data-original>window.literal = "<head>";</script>',
  '<!doctype html><body><template><head></head></template><script data-original>window.literal = "<head>";</script>',
  '<!doctype html><head title="a > b"></head><body><script data-original>window.literal = "<head>";</script>',
  '<body><script data-original>window.literal = "<head>";</script>',
])('injects into parsed markup without changing script literals or document mode: %s', (html) => {
  const original = new JSDOM(html);
  const injected = new JSDOM(captureGameDocument(html));
  try {
    expect(injected.window.document.compatMode).toBe(original.window.document.compatMode);
    expect(injected.window.document.querySelector('[data-original]')?.textContent).toBe('window.literal = "<head>";');
    expect(injected.window.document.head.querySelector('script')?.textContent).toContain('gdpl-capture');
    expect(injected.window.document.head.getAttribute('title')).toBe(
      original.window.document.head.getAttribute('title'),
    );
  } finally {
    original.window.close();
    injected.window.close();
  }
});

it.runIf(process.env.GAMEDEV_CAPTURE_BROWSER_TEST === '1').each(['head', 'body'])(
  'waits for asynchronous non-GameKit drawing with a real %s document',
  async (tag) => {
    const html = `<!doctype html>${tag === 'head' ? '<head></head>' : '<!-- <head> is inert -->'}<body style="margin:0;background:white">
      <canvas width="960" height="600"></canvas><script>
      const literal = '<head>';
      setTimeout(() => {
        const ctx = document.querySelector('canvas').getContext('2d');
        ctx.fillStyle = '#23aa77'; ctx.fillRect(0, 0, 960, 600);
      }, 500);
      </script></body>`;
    const server = createServer((_request, response) => {
      response.setHeader('Content-Type', 'text/html');
      response.setHeader('Content-Security-Policy', CAPTURE_CSP);
      response.end(capturePage(html));
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('No test listener.');
      const result = await captureBrowser({
        url: `http://127.0.0.1:${address.port}/`,
        viewport: 'desktop',
        signal: AbortSignal.timeout(45_000),
      });
      expect(result.errors).toEqual([]);
      const png = PNG.sync.read(Buffer.from(result.png, 'base64'));
      const center = (300 * png.width + 480) * 4;
      expect([...png.data.subarray(center, center + 4)]).toEqual([35, 170, 119, 255]);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  },
  60_000,
);
