import { chromium } from 'playwright-core';
import { expect, it } from 'vitest';
import { findChromium } from './browser.js';
import { chromiumSandbox } from './sandbox.js';
import { liveGameFixture } from './play-live-game-fixture.js';

it.skipIf(!findChromium())(
  'slow leased actions keep exact frames and can be reclaimed mid-command',
  async () => {
    const fixture = await liveGameFixture();
    const browser = await chromium.launch({
      executablePath: findChromium()!,
      headless: true,
      chromiumSandbox: chromiumSandbox().enabled,
    });
    try {
      const page = await browser.newPage();
      await page.goto(fixture.url);
      const body = page.frameLocator('#game').locator('body');
      await page.frameLocator('#game').locator('canvas').waitFor();
      const agent = await fixture.agent();
      await expect
        .poll(async () => {
          try {
            return (await agent.call('game_observe', { screenshot: false })).tabId;
          } catch {
            return '';
          }
        })
        .toBeTruthy();
      const initial = await agent.call('game_take_control', { screenshot: false });
      await body.evaluate(() => {
        const w = window as unknown as { __GAME_HARNESS__: { step: (...args: unknown[]) => unknown } };
        const step = w.__GAME_HARNESS__.step;
        w.__GAME_HARNESS__.step = (...args) => {
          const until = performance.now() + 20;
          while (performance.now() < until) {
            // Expensive frame.
          }
          return step(...args);
        };
      });
      const moved = await agent.call('game_act', {
        screenshot: false,
        actions: [
          { kind: 'press', key: 'ArrowRight', frames: 300 },
          { kind: 'press', key: 'ArrowRight', frames: 300 },
        ],
      });
      expect(moved.data.observation.frame).toBe(initial.data.observation.frame + 600);
      expect(Number(moved.data.observation.snapshot.x)).toBe(Number(initial.data.observation.snapshot.x) + 600);
      expect(moved.data.observation.snapshot.boot).toBe(initial.data.observation.snapshot.boot);
      expect(await page.locator('#agent-control').isVisible()).toBe(true);
      const running = agent
        .call('game_act', { screenshot: false, actions: [{ kind: 'press', key: 'ArrowRight', frames: 300 }] })
        .catch((error: Error) => error);
      await expect
        .poll(() =>
          body.evaluate(() => (window as unknown as { fixture: { keys: Set<string> } }).fixture.keys.has('ArrowRight')),
        )
        .toBe(true);
      await page.click('#agent-reclaim');
      expect(String(await running)).toContain('reclaimed');
      const atRelease = await body.evaluate(() => {
        const f = (window as unknown as { fixture: { keys: Set<string>; position(): number } }).fixture;
        return { keys: [...f.keys], x: f.position() };
      });
      expect(atRelease.keys).toEqual([]);
      expect(atRelease.x).toBeLessThan(Number(moved.data.observation.snapshot.x) + 300);
      // Cancellation must stop movement after play resumes.
      await expect
        .poll(() => body.evaluate(() => (window as unknown as { fixture: { position(): number } }).fixture.position()))
        .toBe(atRelease.x);
      await expect(agent.call('game_take_control')).rejects.toThrow('revoked');
    } finally {
      await browser.close();
      await fixture.close();
    }
  },
  60_000,
);
