import { createServer, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build, transform } from 'esbuild';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from 'playwright-core';
import { browserPrerequisite, launchSiteBrowser } from './browser.js';

const prerequisite = browserPrerequisite();
if (!prerequisite.ok) console.warn(`[e2e] SKIPPED document bridge: ${prerequisite.reason}`);
let browser: Browser;
let server: Server;
let baseUrl: string;
let saveModule: string | null = null;

const web = resolve(import.meta.dirname, '../../web');
const entry = `
import React, { useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { GameFrame } from './src/GameFrame.js';
import { useGameSaveBridge } from './src/gameSave.js';
import { isFromGameFrame } from './src/frameMessage.js';
const fixture = window.bridgeFixture = { reads: 0, pending: [], accepted: [], attempts: 0, loads: 0, mode: 'immediate' };
const root = createRoot(document.getElementById('mount'));
let activeFrame;
window.fetch = async () => {
  fixture.reads++;
  const data = fixture.mode === 'pending' ? await new Promise(resolve => fixture.pending.push(resolve)) : 'current-save';
  return new Response(JSON.stringify({data:JSON.stringify({secret:data}),version:1,updatedAt:'now'}), {status:200});
};
function Host({html}) {
  const frameRef = useRef(null);
  activeFrame = frameRef;
  useGameSaveBridge(frameRef, 'document-test');
  return <GameFrame title="document-test" html={html} frameRef={frameRef} autoFocus={false}/>;
}
fixture.render = html => root.render(<Host html={html}/>);
fixture.release = secret => fixture.pending.shift()(secret);
document.addEventListener('load', event => { if(event.target.tagName === 'IFRAME') fixture.loads++; }, true);
window.addEventListener('message', event => {
  if (!event.data?.proof) return;
  fixture.attempts++;
  if (isFromGameFrame(event, activeFrame?.current)) fixture.accepted.push(event.data);
});
`;

const hello = `window.parent.postMessage({ns:'gdp',v:1,t:'save:hello',version:1},'*');`;
const listen = `addEventListener('message',event=>{
  if(event.source===parent && event.data?.t==='save:state')
    parent.postMessage({proof:'reply',data:event.data.data},'*');
});`;
const html = (code: string) => `<!doctype html><html><head></head><body><script>${code}</script></body></html>`;

async function openFixture(mode = 'immediate'): Promise<Page> {
  const page = await browser.newPage();
  await page.goto(baseUrl);
  await page.waitForFunction(() => Boolean((window as unknown as { bridgeFixture?: unknown }).bridgeFixture));
  await page.evaluate((mode) => {
    (window as unknown as { bridgeFixture: { mode: string } }).bridgeFixture.mode = mode;
  }, mode);
  return page;
}

async function render(page: Page, source: string) {
  await page.evaluate((source) => {
    (window as unknown as { bridgeFixture: { render: (source: string) => void } }).bridgeFixture.render(source);
  }, source);
  await page.waitForSelector('iframe');
}

async function state(page: Page) {
  return page.evaluate(() => {
    const fixture = (
      window as unknown as {
        bridgeFixture: { reads: number; accepted: { proof: string; data?: string }[]; attempts: number; loads: number };
      }
    ).bridgeFixture;
    return { reads: fixture.reads, accepted: fixture.accepted, attempts: fixture.attempts, loads: fixture.loads };
  });
}

describe.skipIf(!prerequisite.ok)('iframe document authorization in native Chromium', () => {
  beforeAll(async () => {
    const sdkPath = process.env.FRAME_DOCUMENT_GAMEKIT_SAVE_PATH;
    if (sdkPath) saveModule = (await transform(await readFile(sdkPath, 'utf8'), { loader: 'ts' })).code;
    const result = await build({
      stdin: { contents: entry, resolveDir: web, sourcefile: 'document-fixture.tsx', loader: 'tsx' },
      bundle: true,
      alias: { '@gamedevpl/contract': resolve(web, '../../packages/contract/src/index.ts') },
      write: false,
      platform: 'browser',
      format: 'iife',
      define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': '{}' },
    });
    const script = result.outputFiles[0]!.text;
    server = createServer((request, response) => {
      response.setHeader('Content-Type', 'text/html');
      if (request.url === '/slow') {
        response.setHeader('Content-Type', 'image/png');
        return;
      }
      if (request.url === '/destination?before-load') {
        return response.end(
          html(`
          for(const t of ['save:hello','commons:hello','presence:hello','sensing:hello','voice:hello','zone:hello','party:hello','inspect:hello','editor:hello'])
            parent.postMessage({ns:'gdp',v:1,t,proof:'destination'},'*');`) + '<img src="/slow">',
        );
      }
      if (request.url?.startsWith('/destination')) {
        return response.end(
          html(`${hello}
          parent.postMessage({proof:'destination'},'*');
          addEventListener('message',event=>fetch('/leak?data='+encodeURIComponent(JSON.stringify(event.data))));`),
        );
      }
      response.end(`<div id="mount"></div><script>${script.replaceAll('</script', '<\\/script')}</script>`);
    });
    await new Promise<void>((ready) => server.listen(0, '127.0.0.1', ready));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing fixture address');
    baseUrl = `http://127.0.0.1:${address.port}`;
    browser = await launchSiteBrowser();
    console.info(`[document bridge] Chromium ${browser.version()}`);
    console.info(`[document bridge] save sender: ${saveModule ? 'supplied GameKit module' : 'protocol fixture'}`);
  });

  afterAll(async () => {
    await browser?.close();
    if (server) await new Promise<void>((done) => server.close(() => done()));
  });

  it('keeps the legacy GameKit save handshake and reply working', async () => {
    const page = await openFixture();
    try {
      const code = saveModule
        ? `window.GameKit={};${saveModule};const save=GameKit.createSave({version:1});
           save.ready.then(()=>parent.postMessage({proof:'reply',data:JSON.stringify(save.data)},'*'));`
        : listen + hello;
      await render(page, html(code));
      await expect.poll(async () => (await state(page)).accepted.length).toBe(1);
      expect((await state(page)).accepted[0]!.data).toBe('{"secret":"current-save"}');
    } finally {
      await page.close();
    }
  });

  it('rejects the destination that supplies the first observed iframe load', async () => {
    const page = await openFixture();
    try {
      await render(page, html(`location='/destination?first';`));
      await expect.poll(async () => (await state(page)).attempts).toBe(1);
      await expect.poll(async () => (await state(page)).loads).toBe(1);
      expect(await state(page)).toMatchObject({ reads: 0, accepted: [], loads: 1 });
    } finally {
      await page.close();
    }
  });

  it('rejects every bridge namespace before a later navigation load can mark the frame', async () => {
    const page = await openFixture();
    try {
      await render(page, html('window.started=true;'));
      await expect.poll(async () => (await state(page)).loads).toBe(1);
      const frame = page.frames().find((frame) => frame.parentFrame() === page.mainFrame())!;
      await frame.evaluate(() => {
        location.href = '/destination?before-load';
      });
      await expect.poll(async () => (await state(page)).attempts).toBe(9);
      expect(await state(page)).toMatchObject({ reads: 0, accepted: [], loads: 1 });
    } finally {
      await page.close();
    }
  });

  it('does not deliver an in-flight save to a self-navigation destination', async () => {
    const page = await openFixture('pending');
    const leaks: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('/leak?')) leaks.push(request.url());
    });
    try {
      await render(page, html(listen + hello));
      await expect.poll(async () => (await state(page)).reads).toBe(1);
      const frame = page.frames().find((frame) => frame.parentFrame() === page.mainFrame())!;
      await frame.evaluate(() => {
        location.href = '/destination?delayed';
      });
      await expect.poll(async () => frame.url()).toContain('/destination?delayed');
      await expect.poll(async () => (await state(page)).attempts).toBe(1);
      await page.evaluate(() => {
        (window as unknown as { bridgeFixture: { release: (value: string) => void } }).bridgeFixture.release(
          'old-save',
        );
      });
      await page.waitForTimeout(100);
      expect(leaks).toEqual([]);
      expect(await state(page)).toMatchObject({ reads: 1, accepted: [] });
    } finally {
      await page.close();
    }
  });

  it('binds a delayed save to its initiating document across host replacement', async () => {
    const page = await openFixture('pending');
    try {
      await render(page, html(listen + hello));
      await expect.poll(async () => (await state(page)).reads).toBe(1);
      await render(
        page,
        html(listen + `parent.postMessage({proof:'replacement'},'*');window.ask=function(){${hello}};`),
      );
      await expect.poll(async () => (await state(page)).accepted.length).toBe(1);
      await page.evaluate(() => {
        (window as unknown as { bridgeFixture: { release: (value: string) => void } }).bridgeFixture.release(
          'old-save',
        );
      });
      await page.waitForTimeout(100);
      expect((await state(page)).accepted).toEqual([expect.objectContaining({ proof: 'replacement' })]);
      const frame = page.frames().find((frame) => frame.parentFrame() === page.mainFrame())!;
      await frame.evaluate(() => {
        (window as unknown as { ask: () => void }).ask();
      });
      await expect.poll(async () => (await state(page)).reads).toBe(2);
      await page.evaluate(() => {
        (window as unknown as { bridgeFixture: { release: (value: string) => void } }).bridgeFixture.release(
          'new-save',
        );
      });
      await expect.poll(async () => (await state(page)).accepted.length).toBe(2);
      expect((await state(page)).accepted[1]!.data).toBe('{"secret":"new-save"}');
    } finally {
      await page.close();
    }
  });
});
