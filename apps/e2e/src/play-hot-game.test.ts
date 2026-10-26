import { createHash } from 'node:crypto';
import { chromium } from 'playwright-core';
import { expect, it } from 'vitest';
import { findChromium } from './browser.js';
import { chromiumSandbox } from './sandbox.js';
import { liveGameFixture } from './play-live-game-fixture.js';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');
function build(label: string) {
  const bundle = `window.__GAME_HOT__.register({label:${JSON.stringify(label)}});`;
  const html = `<!doctype html><html><head></head><body><canvas id="game" width="640" height="400"></canvas><script>
    let epoch=0,frame=0,steps=0,label=${JSON.stringify(label)},paused=false;
    const boot=crypto.randomUUID(),canvas=document.querySelector('canvas'),ctx=canvas.getContext('2d');
    function paint(){ctx.fillStyle=label==='A'?'#203050':'#205030';ctx.fillRect(0,0,640,400);h.metadata={label,steps,boot};}
    const h=window.__GAME_HARNESS__={ready:true,frame:0,metadata:{},step(){steps++;frame++;h.frame=frame;paint();return true},paint,pause(){paused=true},resume(){paused=false},screenshot:()=>canvas.toDataURL()};
    function loop(){if(!paused)h.step();requestAnimationFrame(loop)}paint();requestAnimationFrame(loop);
    function status(){return {id:'fixture',stateVersion:1,epoch,ready:true,frame,simulationTick:steps}}
    window.__GAME_HOT__={protocol:1,bootHash:'${hash('boot')}',controller:{status,replace(token,expected){if(expected!==epoch)return {status:'rejected',reason:'stale-epoch',...status()};label=token.label;epoch++;paint();return {status:'applied',...status()}}}};
  </script></body></html>`;
  return {
    html,
    hot: {
      protocol: 1,
      bootHash: hash('boot'),
      sourceTreeHash: hash(html),
      bundleHash: hash(bundle),
      stateVersion: 1,
      observationVersion: 1,
      bundle,
    },
  };
}

it.skipIf(!findChromium())(
  'loads A → B → A in one opaque instance and preserves a lease across journal/code boundaries',
  async () => {
    const a = build('A'),
      b = build('B');
    const fixture = await liveGameFixture(a.html, a.hot);
    const browser = await chromium.launch({
      executablePath: findChromium()!,
      headless: true,
      chromiumSandbox: chromiumSandbox().enabled,
    });
    try {
      const page = await browser.newPage();
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(fixture.url);
      await expect
        .poll(() => page.locator('#shown-build').textContent(), { timeout: 15000 })
        .toContain(hash(a.html).slice(0, 10));
      const agent = await fixture.agent();
      await expect
        .poll(
          async () => {
            try {
              return !!(await agent.call('game_observe', { screenshot: false })).revision;
            } catch {
              return false;
            }
          },
          { timeout: 15000 },
        )
        .toBe(true);
      await agent.call('game_take_control', { screenshot: false });
      const before = await agent.call('game_observe', { screenshot: false });
      const snapshot = before.data.observation.snapshot;
      await page.locator('#policy').selectOption('auto', { force: true });
      fixture.update(b.html, b.hot);
      await expect
        .poll(() => page.locator('#shown-build').textContent(), { timeout: 15000 })
        .toContain(hash(b.html).slice(0, 10));
      await expect(
        agent.call('game_act', { actions: [{ kind: 'step', frames: 1 }], screenshot: false }),
      ).rejects.toThrow('game_observe');
      const after = await agent.call('game_observe', { screenshot: false });
      expect(after.data.observation.snapshot).toMatchObject({ label: 'B', steps: snapshot.steps, boot: snapshot.boot });
      expect(after.data.observation.frame).toBe(before.data.observation.frame);
      await agent.call('game_act', { actions: [{ kind: 'step', frames: 2 }], screenshot: false });
      fixture.update(a.html, a.hot);
      await expect
        .poll(() => page.locator('#shown-build').textContent(), { timeout: 15000 })
        .toContain(hash(a.html).slice(0, 10));
      const back = await agent.call('game_observe', { screenshot: false });
      expect(back.data.observation.snapshot).toMatchObject({
        label: 'A',
        steps: Number(snapshot.steps) + 2,
        boot: snapshot.boot,
      });
      await expect
        .poll(
          async () => {
            const result = (await agent.call('game_journal')) as unknown as {
              data: { recordings: { segment?: { buildEpoch: number } }[] };
            };
            return result.data.recordings.map((r) => r.segment?.buildEpoch);
          },
          { timeout: 15000 },
        )
        .toEqual([0, 1, 2]);
      expect(await page.locator('iframe').count()).toBe(1);
      expect(await page.locator('#game').getAttribute('sandbox')).toBe('allow-scripts allow-pointer-lock');
      expect(errors).toEqual([]);
      await agent.call('game_release_control');
    } finally {
      await browser.close();
      await fixture.close();
    }
  },
);
