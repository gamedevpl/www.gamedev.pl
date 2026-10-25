import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { expect, it } from 'vitest';
import { browserPrerequisite, findChromium } from './browser.js';
import { chromium } from 'playwright-core';
import { chromiumSandbox } from './sandbox.js';

const web = resolve(import.meta.dirname, '../../web');
const game = `<!doctype html><html><head></head><body><canvas id="game" width="320" height="200"></canvas><script>
const canvas=document.querySelector('canvas'),ctx=canvas.getContext('2d');
let frames=0,x=0;addEventListener('keydown',()=>x++);
window.__GAME_HARNESS__={ready:true,frame:0,metadata:{},step(){this.frame=++frames;this.metadata={x};ctx.fillRect(x,0,10,10)},snapshotState(){return {x}}};
function loop(){__GAME_HARNESS__.step();requestAnimationFrame(loop)}requestAnimationFrame(loop);
</script></body></html>`;
const entry = `
import React, {useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {GameFrame} from './src/GameFrame.js';
import {StudioPlayJournalProvider} from './src/surfaces/studio/StudioPlayJournal.js';
import {useStudioJournalRecorder} from './src/surfaces/studio/studioPlayJournalHooks.js';
import {FeedbackPanel} from './src/surfaces/studio/FeedbackPanel.js';
import i18n, {i18nReady} from './src/i18n/index.js';
window.Worker=undefined;window.setLanguage=(value)=>i18n.changeLanguage(value);

window.sent=[];window.fetch=async (url,init)=>{if(init?.method==='POST')window.sent.push(JSON.parse(init.body));return new Response(JSON.stringify({ok:true,target:'agent'}),{status:window.failSend?500:200});};
function Host(){
 const frame=useRef(null),[version,setVersion]=useState('v1');
 window.swap=()=>setVersion('v2');
 const html=${JSON.stringify(game)}+version;
 const bridge=useStudioJournalRecorder(frame,html,version);
 return <><GameFrame title="Test game" frameRef={frame} html={html} embed agentBridge={bridge} autoFocus={false}/><FeedbackPanel compact token="test" published={false} building={false} onSent={()=>{}}/></>;
}
i18nReady.then(async()=>{await i18n.changeLanguage('en');createRoot(document.getElementById('mount')).render(<StudioPlayJournalProvider><Host/></StudioPlayJournalProvider>);});
`;
it.skipIf(!browserPrerequisite().ok)(
  'Studio sends only explicitly frozen journals, preserving their played version',
  async () => {
    const result = await build({
      stdin: { contents: entry, resolveDir: web, sourcefile: 'journal-fixture.tsx', loader: 'tsx' },
      bundle: true,
      loader: { '.css': 'empty' },
      alias: { '@gamedevpl/contract': resolve(web, '../../packages/contract/src/index.ts') },
      write: false,
      platform: 'browser',
      format: 'iife',
      define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': '{}' },
    });
    const css = (
      await Promise.all(
        ['status-composer.css', 'status-feedback.css'].map((p) =>
          readFile(resolve(web, 'src/surfaces/studio', p), 'utf8'),
        ),
      )
    ).join('\n');
    const server = createServer((_, res) =>
      res.end(
        `<style>body{margin:0}.hidden-file-input{display:none}*{box-sizing:border-box}iframe{width:100%;height:240px}${css}</style><div id="mount"></div><script>${result.outputFiles[0]!.text.replaceAll('</script', '<\\/script')}</script>`,
      ),
    );
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    const browser = await chromium.launch({
      executablePath: findChromium()!,
      chromiumSandbox: chromiumSandbox().enabled,
    });
    try {
      const page = await browser.newPage({ viewport: { width: 390, height: 700 } });
      const errors: string[] = [];
      page.on('pageerror', (e) => {
        errors.push(e.message);
        console.error(e.message);
      });
      const address = server.address();
      if (!address || typeof address === 'string') throw Error('server');
      await page.goto(`http://127.0.0.1:${address.port}`);
      await expect
        .poll(() =>
          page.getByRole('button', { name: 'Attach play recording', exact: true }).isEnabled({ timeout: 2000 }),
        )
        .toBe(true)
        .catch(async (error) => {
          console.error(await page.locator('body').innerText());
          console.error(errors);
          throw error;
        });
      const send = async (text: string) => {
        await page.locator('textarea').fill(text);
        await page.locator('.status-composer .primary-btn').click();
      };
      await send('First message without a recording');
      await expect.poll(() => page.evaluate(() => (window as unknown as { sent: unknown[] }).sent.length)).toBe(1);
      expect(
        await page.evaluate(() => (window as unknown as { sent: { context?: unknown }[] }).sent[0]?.context),
      ).toBeUndefined();
      await page.frameLocator('iframe').locator('canvas').click();
      await page.keyboard.press('ArrowRight');
      await page.getByRole('button', { name: 'Attach play recording', exact: true }).click();
      await page.evaluate(() => (window as unknown as { swap(): void }).swap());
      await send('Inspect the problem in the attached recording');
      await expect.poll(() => page.evaluate(() => (window as unknown as { sent: unknown[] }).sent.length)).toBe(2);
      const journal = await page.evaluate(
        () =>
          (
            window as unknown as {
              sent: { context: { playJournal: { version: string; entries: { kind: string; data: unknown }[] } } }[];
            }
          ).sent[1]!.context.playJournal,
      );
      expect(journal.version).toBe('v1');
      expect(journal.entries.some((e) => e.kind === 'state')).toBe(true);
      await expect
        .poll(() =>
          page.getByRole('button', { name: 'Attach play recording', exact: true }).isEnabled({ timeout: 2000 }),
        )
        .toBe(true);
      await page.getByRole('button', { name: 'Attach play recording', exact: true }).click();
      await send('Second recording comes from the new build');
      await expect.poll(() => page.evaluate(() => (window as unknown as { sent: unknown[] }).sent.length)).toBe(3);
      expect(
        await page.evaluate(
          () =>
            (window as unknown as { sent: { context: { playJournal: { version: string } } }[] }).sent[2]!.context
              .playJournal.version,
        ),
      ).toBe('v2');
      await page.getByRole('button', { name: 'Attach play recording', exact: true }).click();
      await page.evaluate(() => {
        (window as unknown as { failSend: boolean }).failSend = true;
      });
      await send('Keep the attached recording when sending fails');
      await expect
        .poll(() => page.getByRole('button', { name: 'Remove play recording', exact: true }).isEnabled())
        .toBe(true);
      await page.evaluate(() => {
        (window as unknown as { failSend: boolean }).failSend = false;
      });
      await page.getByRole('button', { name: 'Remove play recording', exact: true }).click();
      await send('This message removes the previous attachment');
      await expect.poll(() => page.evaluate(() => (window as unknown as { sent: unknown[] }).sent.length)).toBe(5);
      expect(
        await page.evaluate(() => (window as unknown as { sent: { context?: unknown }[] }).sent[4]?.context),
      ).toBeUndefined();
      await page.evaluate(() => (window as unknown as { setLanguage(value: string): Promise<void> }).setLanguage('pl'));
      for (const width of [390, 1280]) {
        await page.setViewportSize({ width, height: 700 });
        await page.screenshot({ path: '/tmp/studio-journal-' + width + '.png' });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        expect((await page.locator('.studio-journal-attachment small').boundingBox())!.height).toBeLessThan(100);
      }
      expect(errors).toEqual([]);
    } finally {
      await browser.close();
      server.closeAllConnections();
      await new Promise<void>((done) => server.close(() => done()));
    }
  },
);
