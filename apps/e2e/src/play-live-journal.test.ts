import { chromium } from 'playwright-core';
import { expect, it } from 'vitest';
import { findChromium } from './browser.js';
import { chromiumSandbox } from './sandbox.js';
import { liveGameFixture } from './play-live-game-fixture.js';
import type { JournalEntry } from '../../cli/src/live-journal-protocol.js';

type Catalog = { recordings: Array<{ recordingId: string; last: number; revision: string; reportedGaps: number }> };
type Page = { entries: JournalEntry[]; nextAfter: number | null; through: number };

it.skipIf(!findChromium())(
  'queries historical state and input across tasks, build changes and tab closure',
  async () => {
    const fixture = await liveGameFixture();
    const browser = await chromium.launch({
      executablePath: findChromium()!,
      headless: true,
      chromiumSandbox: chromiumSandbox().enabled,
    });
    try {
      const page = await browser.newPage();
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
        .toBeGreaterThan(35);
      await page.keyboard.up('ArrowRight');
      await game.locator('body').evaluate(() => {
        const detail = { count: 7 };
        console.warn('before agent', detail);
        detail.count = 999;
        for (let i = 0; i < 600; i++) dispatchEvent(new KeyboardEvent('keyup', { key: 'j', code: 'KeyJ' }));
      });
      const agent = await fixture.agent();
      const catalog = async () => (await agent.call('game_journal')).data as unknown as Catalog;
      const read = async (args: object) => (await agent.call('game_journal_read', args)).data as unknown as Page;
      await expect.poll(async () => (await catalog()).recordings.length).toBe(1);
      const recordingId = (await catalog()).recordings[0]!.recordingId;
      const initial = await agent.call('game_take_control');
      const moved = await agent.call('game_act', { actions: [{ kind: 'press', key: 'ArrowRight', frames: 20 }] });
      await expect
        .poll(
          async () =>
            (await read({ recordingId, kinds: ['state'], fromFrame: moved.data.observation.frame })).entries.length,
        )
        .toBeGreaterThan(0);
      const historic = await read({
        recordingId,
        kinds: ['state'],
        fromFrame: initial.data.observation.frame + 1,
        toFrame: moved.data.observation.frame,
      });
      expect(historic.entries.map((entry) => entry.frame)).toEqual(
        Array.from({ length: 20 }, (_, i) => initial.data.observation.frame + 1 + i),
      );
      const old = historic.entries[4]!;
      const exact = { recordingId, after: old.seq - 1, through: old.seq };
      const retained = await read(exact);
      expect(retained).toMatchObject({
        instrumentation: { snapshotStatus: 'available', nextStep: 'inspect_recorded_fields' },
      });
      const missing = await read({
        recordingId,
        kinds: ['state'],
        after: old.seq - 1,
        through: old.seq,
        where: { path: '/persistedState/collisions', op: 'eq', value: true },
      });
      expect(missing).toMatchObject({
        entries: [],
        fieldAvailability: { paths: { '/persistedState/collisions': { present: 0, missing: 1 } } },
      });
      expect(retained.entries[0]?.data).toMatchObject({
        persistedState: { x: Number(initial.data.observation.snapshot.x) + 5, frame: old.frame },
        stateStatus: 'available',
        actor: 'agent',
        heldKeys: ['ArrowRight'],
      });
      const sampled = await read({
        recordingId,
        kinds: ['state'],
        fromFrame: old.frame,
        toFrame: moved.data.observation.frame,
        everyFrames: 5,
        fields: ['/persistedState/x'],
      });
      expect(sampled.entries.map((entry) => entry.frame)).toEqual([
        old.frame,
        old.frame + 5,
        old.frame + 10,
        old.frame + 15,
      ]);
      expect(
        (
          await read({ recordingId, kinds: ['input'], where: { path: '/actor', op: 'eq', value: 'player' } })
        ).entries.some((entry) => (entry.data as { key?: string }).key === 'ArrowRight'),
      ).toBe(true);
      expect(
        (
          await read({ recordingId, kinds: ['input'], where: { path: '/actor', op: 'eq', value: 'agent' } })
        ).entries.some((entry) => (entry.data as { key?: string }).key === 'ArrowRight'),
      ).toBe(true);
      const logs = await read({ recordingId, kinds: ['console'] });
      expect(logs.entries[0]?.data).toMatchObject({ level: 'warn', args: ['before agent', { count: 7 }] });
      let after = 0,
        through: number | undefined,
        count = 0;
      do {
        const result = await read({
          recordingId,
          kinds: ['input'],
          where: { path: '/key', op: 'eq', value: 'j' },
          after,
          through,
          limit: 200,
        });
        count += result.entries.length;
        through = result.through;
        after = result.nextAfter ?? 0;
      } while (after);
      expect(count).toBe(600);
      await agent.call('game_release_control');
      agent.stop();
      const next = await fixture.agent();
      expect((await next.call('game_journal_read', exact)).data).toMatchObject({ entries: retained.entries });
      fixture.update();
      await page.locator('#apply').waitFor();
      await page.click('#apply');
      await expect
        .poll(async () => ((await next.call('game_journal')).data as unknown as Catalog).recordings.length, {
          timeout: 10000,
        })
        .toBe(2);
      await page.close();
      expect((await next.call('game_journal_read', exact)).data).toMatchObject({ entries: retained.entries });
      expect(errors).toEqual([]);
    } finally {
      await browser.close();
      await fixture.close();
    }
  },
);
