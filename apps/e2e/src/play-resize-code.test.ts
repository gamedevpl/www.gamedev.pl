import { chromium, type Page } from 'playwright-core';
import { expect, it } from 'vitest';
import { findChromium } from './browser.js';
import { chromiumSandbox } from './sandbox.js';
import { playCodeFixture, chooseCodeView } from './play-code-fixture.js';

const executablePath = findChromium();
async function bounds(page: Page, selector: string) {
  const box = await page.locator(selector).boundingBox();
  if (!box) throw Error(`Missing visible ${selector}`);
  return box;
}
async function drag(page: Page, selector: string, x: number, y: number) {
  const box = await bounds(page, selector);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + x, box.y + box.height / 2 + y, { steps: 8 });
  await page.mouse.up();
  expect(await page.locator('body').getAttribute('data-resizing')).toBeNull();
}

it.skipIf(!executablePath)(
  'resizes the editor rail, preview and files without remounting, and restores saved sizes',
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
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(fixture.url);
      const game = page.frameLocator('#game');
      await game.locator('#score').waitFor();
      const boot = await game.locator('body').evaluate(() => (window as unknown as { boot: string }).boot);
      await page.getByRole('button', { name: 'Code', exact: true }).click();
      await page.locator('.cm-content').waitFor();
      await chooseCodeView(page, 'editor-chat-preview');
      const editor = await page.locator('.cm-content').elementHandle();
      await page.locator('.cm-content').click();
      await page.keyboard.press('ControlOrMeta+End');
      await page.keyboard.insertText('// resize draft');
      await page.locator('#prompt').fill('Keep this conversation draft');

      await drag(page, '#panel-resize', -180, 0);
      expect((await bounds(page, '#panel')).width).toBe(570);
      expect((await bounds(page, '#code-panel')).width).toBe(870);
      expect((await bounds(page, '#game')).width).toBe(570);
      await drag(page, '#code-preview-resize', 0, -140);
      expect((await bounds(page, '#game')).height).toBe(400);
      expect((await bounds(page, '#panel')).height).toBe(600);
      await drag(page, '#code-files-resize', 80, 0);
      expect((await bounds(page, '.code-files-container')).width).toBe(320);
      expect(await editor!.evaluate((node) => node === document.querySelector('.cm-content'))).toBe(true);
      expect(await page.locator('.cm-content').innerText()).toContain('resize draft');
      expect(await page.locator('#prompt').inputValue()).toBe('Keep this conversation draft');
      expect(await game.locator('body').evaluate(() => (window as unknown as { boot: string }).boot)).toBe(boot);

      await page.getByRole('button', { name: 'Move conversation left', exact: true }).click();
      expect((await bounds(page, '#panel-resize')).x).toBe(565);
      await drag(page, '#panel-resize', 50, 0);
      expect((await bounds(page, '#panel')).width).toBe(620);
      expect((await bounds(page, '#code-panel')).x).toBe(620);
      expect((await bounds(page, '#code-preview-resize')).x).toBe(0);
      await page.locator('#panel-resize').focus();
      await page.keyboard.press('ArrowLeft');
      expect((await bounds(page, '#panel')).width).toBe(596);

      await chooseCodeView(page, 'editor-preview');
      expect((await bounds(page, '#panel-resize')).x).toBe(839);
      await drag(page, '#panel-resize', -24, 0);
      expect((await bounds(page, '#game')).width).toBe(620);
      expect(await page.locator('#code-preview-resize').isVisible()).toBe(false);
      await chooseCodeView(page, 'editor');
      expect(await page.locator('#panel-resize').isVisible()).toBe(false);
      await page.getByRole('button', { name: 'Restore Code panel', exact: true }).click();
      expect((await bounds(page, '#game')).width).toBe(620);
      expect(await game.locator('body').evaluate(() => (window as unknown as { boot: string }).boot)).toBe(boot);

      await page.reload();
      await page.getByRole('button', { name: 'Code', exact: true }).click();
      await chooseCodeView(page, 'editor-chat-preview');
      await page.locator('.cm-content').waitFor();
      expect((await bounds(page, '#panel')).width).toBe(620);
      expect((await bounds(page, '#game')).height).toBe(400);
      expect((await bounds(page, '.code-files-container')).width).toBe(320);
      expect(await page.locator('.cm-content').innerText()).toContain('resize draft');
      await page.locator('.cm-content').click();
      await page.keyboard.press('ControlOrMeta+z');
      expect(await page.locator('.cm-content').innerText()).not.toContain('resize draft');

      await page.locator('#code-preview-resize').focus();
      await page.keyboard.press('End');
      expect((await bounds(page, '#panel')).height).toBe(280);
      await page.locator('#code-preview-resize').dblclick();
      expect((await bounds(page, '#game')).height).toBe(260);
      await page.locator('#panel-resize').dblclick();
      expect((await bounds(page, '#panel')).width).toBe(390);
      await page.locator('#code-files-resize').dblclick();
      expect((await bounds(page, '.code-files-container')).width).toBe(240);
      expect(
        await page.evaluate(() =>
          ['play-panel-width', 'play-preview-height', 'play-files-width'].map((key) => localStorage.getItem(key)),
        ),
      ).toEqual([null, null, null]);
      expect(errors).toEqual([]);
      expect(fixture.completions).toEqual([]);
      await page.close();
    } finally {
      await browser.close();
      await fixture.close();
    }
  },
);

it.skipIf(!executablePath)(
  'clamps saved sizes on smaller windows and keeps phone and keyboard layouts usable',
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
      await page.goto(fixture.url);
      await page.getByRole('button', { name: 'Code', exact: true }).click();
      await page.locator('.cm-content').waitFor();
      await chooseCodeView(page, 'editor-chat-preview');
      for (const selector of ['#panel-resize', '#code-preview-resize', '#code-files-resize']) {
        await page.locator(selector).focus();
        await page.keyboard.press('End');
      }
      await page.setViewportSize({ width: 700, height: 400 });
      expect((await bounds(page, '#code-panel')).width).toBeGreaterThanOrEqual(320);
      expect((await bounds(page, '#panel')).height).toBeGreaterThanOrEqual(280);
      expect((await bounds(page, '.code-editor')).width).toBeGreaterThanOrEqual(180);
      const handle = await bounds(page, '#panel-resize');
      await page.mouse.move(handle.x + 5, 100);
      await page.mouse.down();
      await page.mouse.move(5000, 100);
      await page.keyboard.press('Escape');
      await page.mouse.up();
      expect(await page.locator('body').getAttribute('data-resizing')).toBeNull();
      expect(await page.locator('#code-panel').getAttribute('data-view')).toBe('editor-chat-preview');
      for (const height of [844, 400]) {
        await page.setViewportSize({ width: 390, height });
        expect((await bounds(page, '#code-panel')).width).toBe(390);
        for (const selector of ['#panel-resize', '#code-preview-resize', '#code-files-resize'])
          expect(await page.locator(selector).isVisible()).toBe(false);
        await page.getByRole('button', { name: 'Toggle files', exact: true }).click();
        expect((await bounds(page, '.code-files-container')).width).toBeLessThanOrEqual(332);
        await page.getByRole('button', { name: 'Hide files', exact: true }).click();
        expect((await bounds(page, '.code-editor')).width).toBe(390);
      }
      await page.close();
    } finally {
      await browser.close();
      await fixture.close();
    }
  },
);
