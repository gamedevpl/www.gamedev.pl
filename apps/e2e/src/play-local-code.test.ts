import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { expect, it } from 'vitest';
import { findChromium } from './browser.js';
import { chromiumSandbox } from './sandbox.js';
import { playCodeFixture, INITIAL_CODE } from './play-code-fixture.js';
import { withCheckoutWriter } from '../../cli/src/workbench-lock.js';
const executablePath = findChromium();

it.skipIf(!executablePath)(
  'edits a local checkout with shared Studio tools without resetting Play or calling Studio',
  async () => {
    const fixture = await playCodeFixture();
    const browser = await chromium.launch({
      executablePath: executablePath!,
      headless: true,
      chromiumSandbox: chromiumSandbox().enabled,
      args: ['--disable-dev-shm-usage'],
    });
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      const errors: string[] = [],
        requests: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('request', (request) => requests.push(request.url()));
      await page.goto(fixture.url);
      const game = () => page.frameLocator('#game');
      await game().locator('#score').waitFor({ timeout: 30_000 });
      const boot = await game()
        .locator('body')
        .evaluate(() => (window as unknown as { boot: string }).boot);
      await page.click('#code-open');
      await page.waitForSelector('.cm-content');
      await page.waitForFunction(() =>
        document.querySelector('.code-status')?.textContent?.includes('TypeScript ready'),
      );
      await page.click('.cm-content');
      await page.keyboard.press('Control+End');
      await page.keyboard.type('\n// local draft');
      await page.selectOption('#code-file', 'games/demo/game/logic.ts');
      await page.selectOption('#code-file', 'games/demo/game.ts');
      expect(await page.locator('.cm-content').innerText()).toContain('local draft');
      await page.click('[aria-label="Close Code"]');
      await page.click('#edit');
      await page.click('#close');
      await page.click('#code-open');
      expect(await page.locator('.cm-content').innerText()).toContain('local draft');
      expect(
        await game()
          .locator('body')
          .evaluate(() => (window as unknown as { boot: string }).boot),
      ).toBe(boot);
      await page.click('.cm-content');
      await page.keyboard.press('Control+z');
      expect(await page.locator('.cm-content').innerText()).not.toContain('local draft');
      await page.keyboard.press('Control+a');
      await page.keyboard.insertText(INITIAL_CODE + '\nGameKit.math.');
      await page.keyboard.press('Control+Space');
      await page.waitForSelector('.cm-tooltip-autocomplete');
      expect(await page.locator('.cm-tooltip-autocomplete').innerText()).toContain('clamp');
      await page.keyboard.press('Escape');
      expect(await page.locator('#code-panel').isVisible()).toBe(true);
      await page.keyboard.press('Control+a');
      await page.keyboard.insertText(INITIAL_CODE.replace('= 1;', '= 2;'));
      const symbol = await page
        .locator('.cm-line')
        .filter({ hasText: 'GameKit.math.clamp' })
        .evaluate((element) => {
          const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
          for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            const offset = node.textContent?.indexOf('clamp') ?? -1;
            if (offset < 0) continue;
            const range = document.createRange();
            range.setStart(node, offset + 1);
            range.setEnd(node, offset + 3);
            const rect = range.getBoundingClientRect();
            return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
          }
          throw Error('No clamp symbol');
        });
      await page.keyboard.down('Control');
      await page.mouse.move(symbol.x, symbol.y);
      await page.waitForSelector('.cm-tooltip-hover');
      expect(await page.locator('.cm-tooltip-hover').innerText()).toContain('clamp');
      await page.mouse.click(symbol.x, symbol.y);
      await page.keyboard.up('Control');
      await page.waitForFunction(
        () => (document.querySelector('#code-file') as HTMLSelectElement).value === 'shared/game-kit.d.ts',
      );
      expect(await page.locator('.code-status').innerText()).toContain('read-only');
      await page.selectOption('#code-file', 'games/demo/game.ts');
      await page.click('.cm-content');
      await page.keyboard.press('Control+a');
      await page.keyboard.insertText("const broken: number = 'text';");
      await page.waitForSelector('.cm-lintRange-warning');
      await page.keyboard.press('Control+a');
      await page.keyboard.insertText(INITIAL_CODE.replace('= 1;', '= 2;'));
      await page.keyboard.press('Control+s');
      await page.waitForFunction(() => document.querySelector('.code-message')?.textContent?.includes('Saved locally'));
      expect(readFileSync(join(fixture.root, 'games/demo/game.ts'), 'utf8')).toContain('= 2;');
      await page.waitForSelector('#apply:not([hidden])', { timeout: 20_000 });
      expect(
        await game()
          .locator('body')
          .evaluate(() => (window as unknown as { boot: string }).boot),
      ).toBe(boot);
      await page.click('#apply');
      await page.waitForFunction(() => document.querySelector('#notice')?.textContent?.includes('state restored'));
      expect(await game().locator('#build').innerText()).toBe('Build 2');
      expect(
        await game()
          .locator('body')
          .evaluate(
            () =>
              (
                window as unknown as { __GAME_HARNESS__: { snapshotState(): { score: number } } }
              ).__GAME_HARNESS__.snapshotState().score,
          ),
      ).toBe(7);
      await page.click('.cm-content');
      await page.keyboard.press('Control+End');
      await page.click('#commands-open');
      await page.click('#details-open');
      await page.selectOption('#policy', 'freeze');
      await page.click('#drawer-close');
      await page.click('.cm-content');
      await page.keyboard.press('Control+a');
      await page.keyboard.insertText(INITIAL_CODE.replace('= 1;', '= 3;'));
      await page.keyboard.press('Control+s');
      await page.waitForFunction(() => document.querySelector('.code-message')?.textContent?.includes('Saved locally'));
      const credential = new URL(fixture.url);
      const shown = await page.locator('#shown-build').innerText();
      await expect
        .poll(
          async () => {
            const response = await fetch(credential.origin + '/preview/status', {
              headers: { Authorization: 'Bearer ' + credential.hash.slice(1) },
            });
            const status = (await response.json()) as { revision: string; busy: boolean; stale: boolean };
            return !status.busy && !status.stale && !shown.endsWith(status.revision.slice(0, 10));
          },
          { timeout: 20_000 },
        )
        .toBe(true);
      expect(await game().locator('#build').innerText()).toBe('Build 2');
      expect(await page.locator('#apply').isVisible()).toBe(false);
      await page.click('#commands-open');
      await page.click('#details-open');
      await page.selectOption('#policy', 'auto');
      await page.click('#drawer-close');
      await expect.poll(() => game().locator('#build').innerText(), { timeout: 20_000 }).toBe('Build 3');
      expect(
        await game()
          .locator('body')
          .evaluate(
            () =>
              (
                window as unknown as { __GAME_HARNESS__: { snapshotState(): { score: number } } }
              ).__GAME_HARNESS__.snapshotState().score,
          ),
      ).toBe(7);
      await page.click('.cm-content');
      await page.keyboard.press('Control+End');
      await page.keyboard.insertText('// preserved draft');
      let release!: () => void;
      const writer = withCheckoutWriter(
        fixture.root,
        () =>
          new Promise<void>((resolve) => {
            release = resolve;
          }),
      );
      await page.click('#code-save');
      await page.waitForFunction(() => document.querySelector('.code-message')?.textContent?.includes('Save refused'));
      release();
      await writer;
      expect(await page.locator('.cm-content').innerText()).toContain('preserved draft');
      writeFileSync(join(fixture.root, 'games/demo/game.ts'), 'export const external = 5;\n');
      await page.click('#code-save');
      await page.waitForSelector('.code-conflict');
      expect(await page.locator('.cm-content').innerText()).toContain('preserved draft');
      expect(readFileSync(join(fixture.root, 'games/demo/game.ts'), 'utf8')).toBe('export const external = 5;\n');
      await page.locator('.code-conflict summary').click();
      await page.click('#edit');
      await page.evaluate(() => {
        document.body.style.setProperty('--panel-width', '900px');
      });
      await page.click('#dock');
      const codeBounds = (await page.locator('#code-panel').boundingBox())!;
      const chatBounds = (await page.locator('#panel').boundingBox())!;
      expect(chatBounds.x + chatBounds.width).toBeLessThanOrEqual(codeBounds.x);
      await page.click('#close');
      for (const width of [1440, 1200, 900, 390]) {
        await page.setViewportSize({ width, height: width === 390 ? 400 : 800 });
        expect(await page.locator('#code-panel').isVisible()).toBe(true);
        expect((await page.locator('#code-panel').boundingBox())!.x).toBeGreaterThanOrEqual(0);
        await page.locator('.code-ai summary').scrollIntoViewIfNeeded();
        expect(await page.locator('.code-ai summary').isVisible()).toBe(true);
      }
      expect(await page.locator('#game').getAttribute('sandbox')).toBe('allow-scripts allow-pointer-lock');
      expect(
        requests.some(
          (url) =>
            url.includes('/api/') ||
            url.includes('api.openai.com') ||
            url.includes('anthropic.com') ||
            url.includes('googleapis.com'),
        ),
      ).toBe(false);
      expect(errors).toEqual([]);
    } finally {
      await browser.close();
      await fixture.close();
    }
  },
);
