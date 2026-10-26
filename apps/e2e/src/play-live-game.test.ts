import { chromium } from 'playwright-core';
import { expect, it } from 'vitest';
import { PNG } from 'pngjs';
import { findChromium } from './browser.js';
import { chromiumSandbox } from './sandbox.js';
import { liveGameFixture } from './play-live-game-fixture.js';

it.skipIf(!findChromium())(
  'delegated MCP observes and controls the same Play instance, with reclaim and cancellation',
  async () => {
    const fixture = await liveGameFixture();
    const browser = await chromium.launch({
      executablePath: findChromium()!,
      headless: true,
      chromiumSandbox: chromiumSandbox().enabled,
    });
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(fixture.url);
      const game = page.frameLocator('#game');
      await game.locator('canvas').waitFor();
      await game.locator('canvas').click();
      await page.keyboard.down('ArrowRight');
      await expect
        .poll(() =>
          game
            .locator('body')
            .evaluate(() => (window as unknown as { fixture: { position(): number } }).fixture.position()),
        )
        .toBeGreaterThan(30);
      await page.keyboard.up('ArrowRight');
      const agent = await fixture.agent();
      await expect
        .poll(async () => {
          try {
            return (await agent.call('game_observe')).tabId;
          } catch {
            return '';
          }
        })
        .toBeTruthy();
      const observed = await agent.call('game_observe');
      expect(observed.data.observation.stepped).toBe(false);
      const png = PNG.sync.read(Buffer.from(observed.image!, 'base64'));
      expect(png.width).toBeGreaterThan(0);
      expect(new Set(png.data).size).toBeGreaterThan(2);
      await page.keyboard.down('ArrowRight');
      await page.mouse.down();
      const initial = await agent.call('game_take_control');
      expect(initial.data.observation.stepped).toBe(true);
      expect(
        await game
          .locator('body')
          .evaluate(() => (window as unknown as { fixture: { pointing(): boolean } }).fixture.pointing()),
      ).toBe(false);
      await page.mouse.up();
      await page.keyboard.up('ArrowRight');
      await expect
        .poll(async () => {
          const catalog = (await agent.call('game_journal')).data as unknown as {
            recordings: Array<{ recordingId: string }>;
          };
          if (!catalog.recordings.length) return false;
          const read = (
            await agent.call('game_journal_read', {
              recordingId: catalog.recordings[0]!.recordingId,
              kinds: ['input', 'lifecycle'],
            })
          ).data as unknown as {
            entries: Array<{
              seq: number;
              kind: string;
              data: { type?: string; event?: string; actor?: string; cleanup?: boolean; key?: string };
            }>;
          };
          const up = read.entries.find(
            (entry) => entry.data.type === 'keyup' && entry.data.cleanup && entry.data.key === 'ArrowRight',
          );
          const take = read.entries.find((entry) => entry.data.event === 'take-control');
          return up?.data.actor === 'player' && !!take && up.seq < take.seq;
        })
        .toBe(true);
      await page.locator('#agent-reclaim').waitFor();
      await game.locator('canvas').click();
      await page.keyboard.press('ArrowLeft');
      const moved = await agent.call('game_act', { actions: [{ kind: 'press', key: 'ArrowRight', frames: 30 }] });
      expect(moved.data.observation.frame).toBe(initial.data.observation.frame + 30);
      expect(Number(moved.data.observation.snapshot.x)).toBe(Number(initial.data.observation.snapshot.x) + 30);
      expect(moved.data.observation.snapshot.boot).toBe(observed.data.observation.snapshot.boot);
      expect(moved.image).not.toBe(initial.image);
      fixture.update();
      await page.locator('#apply').waitFor();
      await page.click('#apply');
      await expect.poll(() => page.locator('#notice').textContent(), { timeout: 6000 }).toContain('Take back control');
      const kept = await agent.call('game_observe', { screenshot: false });
      expect(kept.data.observation.snapshot.boot).toBe(observed.data.observation.snapshot.boot);
      await page.click('#agent-reclaim');
      await expect.poll(() => page.locator('#agent-control').isVisible()).toBe(false);
      await expect(agent.call('game_take_control')).rejects.toThrow('revoked');
      await expect(agent.call('game_act', { actions: [{ kind: 'step', frames: 1 }] })).rejects.toThrow('revoked');
      const next = await fixture.agent();
      await next.call('game_take_control');
      next.stop();
      await expect.poll(() => page.locator('#agent-control').isVisible()).toBe(false);
      await expect
        .poll(() =>
          game
            .locator('body')
            .evaluate(() => (window as unknown as { fixture: { paused(): boolean } }).fixture.paused()),
        )
        .toBe(false);
      expect(
        await game
          .locator('body')
          .evaluate(() => [...(window as unknown as { fixture: { keys: Set<string> } }).fixture.keys]),
      ).toEqual([]);
      expect(await page.locator('#game').getAttribute('sandbox')).toBe('allow-scripts allow-pointer-lock');
      expect(errors).toEqual([]);
    } finally {
      await browser.close();
      await fixture.close();
    }
  },
);

it.skipIf(!findChromium())(
  'requires a tab selection, keeps reclaim visible on mobile, and expires disconnected control',
  async () => {
    const fixture = await liveGameFixture();
    const browser = await chromium.launch({
      executablePath: findChromium()!,
      headless: true,
      chromiumSandbox: chromiumSandbox().enabled,
    });
    try {
      const one = await browser.newPage(),
        two = await browser.newPage({ viewport: { width: 390, height: 360 } });
      await Promise.all([one.goto(fixture.url), two.goto(fixture.url)]);
      await Promise.all([
        one.frameLocator('#game').locator('canvas').waitFor(),
        two.frameLocator('#game').locator('canvas').waitFor(),
      ]);
      const agent = await fixture.agent();
      await expect
        .poll(async () => {
          try {
            await agent.call('game_observe');
            return '';
          } catch (e) {
            return String(e);
          }
        })
        .toContain('Available tabs');
      await two.evaluate(() => document.getElementById('agent-select')!.click());
      await expect
        .poll(async () => {
          try {
            return (await agent.call('game_observe', { screenshot: false })).tabId;
          } catch {
            return '';
          }
        })
        .toBeTruthy();
      await agent.call('game_take_control');
      expect(await one.locator('#agent-control').isVisible()).toBe(false);
      const box = await two.locator('#agent-reclaim').boundingBox();
      expect(box).toBeTruthy();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.y + box!.height).toBeLessThanOrEqual(360);
      await two.click('#edit');
      await expect
        .poll(async () => {
          const composer = await two.locator('#panel').boundingBox();
          const control = await two.locator('#agent-control').boundingBox();
          return composer!.y + composer!.height <= control!.y;
        })
        .toBe(true);
      await two.click('#close');
      await two.click('#devices-open');
      const drawer = await two.locator('#workbench-tools').boundingBox();
      const badge = await two.locator('#agent-control').boundingBox();
      expect(drawer!.y + drawer!.height).toBeLessThanOrEqual(badge!.y);
      await two.click('#drawer-close');
      for (const viewport of [
        { width: 1280, height: 800 },
        { width: 390, height: 360 },
      ]) {
        await two.setViewportSize(viewport);
        await two.evaluate(() => {
          let code = document.getElementById('code-panel');
          if (!code) {
            code = document.createElement('section');
            code.id = 'code-panel';
            document.body.append(code);
          }
          code.hidden = false;
          code.dataset.view = 'editor-chat-preview';
          document.body.style.setProperty('--notice-space', '300px');
          document.getElementById('panel')!.hidden = false;
        });
        await expect
          .poll(async () => {
            const panel = await two.locator('#panel').boundingBox();
            if (viewport.width > 600) {
              const game = await two.locator('#game').boundingBox();
              return Math.abs(panel!.y + panel!.height - game!.y) < 1;
            }
            const control = await two.locator('#agent-control').boundingBox();
            return panel!.y + panel!.height <= control!.y;
          })
          .toBe(true);
      }
      await two.evaluate(() => {
        dispatchEvent(new Event('pagehide'));
      });
      await expect.poll(() => two.locator('#agent-control').isVisible()).toBe(false);
      await expect(agent.call('game_act', { actions: [{ kind: 'step', frames: 1 }] })).rejects.toThrow();
    } finally {
      await browser.close();
      await fixture.close();
    }
  },
);
