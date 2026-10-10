import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { expect, it } from 'vitest';
import { findChromium } from './browser.js';
import { chromiumSandbox } from './sandbox.js';
import { playCodeFixture, INITIAL_CODE } from './play-code-fixture.js';

const executablePath = findChromium();
it.skipIf(!executablePath)(
  'restores dirty undo after refresh, reads only changed files and removes deleted TS context',
  async () => {
    const fixture = await playCodeFixture();
    const browser = await chromium.launch({
      executablePath: executablePath!,
      headless: true,
      chromiumSandbox: chromiumSandbox().enabled,
      args: ['--disable-dev-shm-usage'],
    });
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(fixture.url);
      await page.click('#code-open');
      await page.waitForFunction(() =>
        document.querySelector('.code-status')?.textContent?.includes('TypeScript ready'),
      );
      const fileRequests: string[] = [];
      page.on('request', (request) => {
        if (new URL(request.url()).pathname === '/code/file') fileRequests.push(request.postDataJSON().path);
      });
      const poll = await page.waitForResponse((response) => new URL(response.url()).pathname === '/code/project');
      const index = await poll.json();
      expect(index.files.length).toBe(3);
      expect(index.files.every((file: Record<string, unknown>) => !('content' in file) && !('version' in file))).toBe(
        true,
      );
      expect(fileRequests).toEqual([]);
      await page.click('.cm-content');
      await page.keyboard.press('Control+End');
      await page.keyboard.insertText('// refresh draft');
      await page.selectOption('#code-file', 'games/demo/game/logic.ts');
      await page.selectOption('#code-file', 'games/demo/game.ts');
      const dialog = page.waitForEvent('dialog');
      const reload = page.reload();
      const warning = await dialog;
      expect(warning.type()).toBe('beforeunload');
      await warning.accept();
      await reload;
      await page.click('#code-open');
      await page.waitForSelector('.cm-content');
      expect(await page.locator('.cm-content').innerText()).toContain('refresh draft');
      await page.click('.cm-content');
      await page.keyboard.press('Control+z');
      expect((await page.locator('.cm-content').innerText()).trimEnd()).toBe(INITIAL_CODE.trimEnd());
      await page.keyboard.press('Control+End');
      await page.keyboard.insertText('// retain after disk change');
      fileRequests.length = 0;
      writeFileSync(join(fixture.root, 'games/demo/game.ts'), 'export const external = 8;\n');
      await page.waitForSelector('.code-conflict');
      expect(await page.locator('.cm-content').innerText()).toContain('retain after disk change');
      expect(fileRequests).toEqual(['games/demo/game.ts']);
      await page.click('.cm-content');
      await page.keyboard.press('Control+a');
      await page.keyboard.insertText("import { sibling } from './game/logic.js';\nconsole.log(sibling);\n");
      await page.waitForFunction(() =>
        document.querySelector('.code-status')?.textContent?.includes('TypeScript ready'),
      );
      await page.waitForResponse((response) => new URL(response.url()).pathname === '/code/project');
      expect(await page.locator('.cm-lintRange-warning').count()).toBe(0);
      rmSync(join(fixture.root, 'games/demo/game/logic.ts'));
      await page.waitForSelector('.cm-lintRange-warning');
      await expect.poll(() => page.locator('#code-file option[value="games/demo/game/logic.ts"]').count()).toBe(0);
      expect(errors).toEqual([]);
    } finally {
      await browser.close();
      await fixture.close();
    }
  },
);
