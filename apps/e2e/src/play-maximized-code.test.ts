import { chromium } from 'playwright-core';
import { expect, it } from 'vitest';
import { findChromium } from './browser.js';
import { chromiumSandbox } from './sandbox.js';
import { playCodeFixture, INITIAL_CODE } from './play-code-fixture.js';

const executablePath = findChromium();
it.skipIf(!executablePath)(
  'switches editor, chat, preview and game views without losing drafts, undo, completion or game state',
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
      const game = page.frameLocator('#game');
      await game.locator('#score').waitFor({ timeout: 30_000 });
      await game.locator('#score').click();
      const boot = await game.locator('body').evaluate(() => (window as unknown as { boot: string }).boot);
      await page.click('#code-open');
      await page.waitForFunction(() =>
        document.querySelector('.code-status')?.textContent?.includes('TypeScript ready'),
      );
      await page.click('.cm-content');
      await page.keyboard.press('Control+End');
      await page.keyboard.insertText('\n// fullscreen draft');
      const editor = (await page.locator('.cm-content').elementHandle())!;
      await page.click('#edit');
      await page.waitForFunction(
        () =>
          document.getElementById('notice')?.textContent === '' &&
          document.body.style.getPropertyValue('--notice-space') === '0px',
      );
      const previous = await page.locator('#code-panel').boundingBox();
      expect(previous).toEqual({ x: 12, y: 84, width: 720, height: 902 });
      await page.getByRole('button', { name: 'Maximize Code editor' }).click();
      expect(await page.locator('#code-panel').boundingBox()).toEqual({ x: 0, y: 0, width: 1440, height: 1000 });
      expect(await editor.evaluate((node) => node === document.querySelector('.cm-content'))).toBe(true);
      expect(await page.locator('#panel').isVisible()).toBe(false);
      expect(await page.locator('#tools').isVisible()).toBe(false);
      expect(await page.locator('.cm-content').innerText()).toContain('fullscreen draft');
      await page.click('.cm-content');
      await page.keyboard.press('Control+a');
      await page.keyboard.insertText(INITIAL_CODE + '\nGameKit.math.');
      await page.keyboard.press('Control+Space');
      await page.waitForSelector('.cm-tooltip-autocomplete');
      expect(await page.locator('.cm-tooltip-autocomplete').innerText()).toContain('clamp');
      await page.keyboard.press('Escape');
      expect(await page.locator('#code-panel').getAttribute('data-maximized')).toBe('true');
      await page.keyboard.press('Escape');
      expect(await page.locator('#code-panel').getAttribute('data-maximized')).toBe('false');
      await expect.poll(() => page.locator('#code-panel').boundingBox()).toEqual(previous);
      expect(await page.locator('#panel').isVisible()).toBe(true);
      await page.keyboard.press('Control+z');
      expect(await page.locator('.cm-content').innerText()).toContain('fullscreen draft');
      await page.getByRole('button', { name: 'Maximize Code editor' }).click();
      await page.selectOption('#code-file', 'games/demo/game/logic.ts');
      await page.selectOption('#code-file', 'games/demo/game.ts');
      expect(await page.locator('.cm-content').innerText()).toContain('fullscreen draft');
      await page.click('.cm-content');
      await page.keyboard.press('Control+z');
      expect(await page.locator('.cm-content').innerText()).not.toContain('fullscreen draft');
      await page.getByRole('button', { name: 'Restore Code panel' }).click();
      await expect.poll(() => page.locator('#code-panel').boundingBox()).toEqual(previous);
      await page.getByRole('button', { name: 'Maximize Code editor' }).click();
      await page.evaluate(() => document.getElementById('edit')!.click());
      expect(await page.locator('#code-panel').getAttribute('data-maximized')).toBe('false');
      expect(await page.locator('#panel').isVisible()).toBe(true);
      expect(await page.locator('#prompt').evaluate((node) => node === document.activeElement)).toBe(true);
      await page.click('.cm-content');
      await page.keyboard.press('Control+End');
      await page.keyboard.insertText('\n// layout draft');
      const retainedEditor = (await page.locator('.cm-content').elementHandle())!;
      await page.click('#dock');
      for (const width of [1440, 900, 390]) {
        const height = width === 390 ? 400 : 800;
        await page.setViewportSize({ width, height });
        await page.getByRole('button', { name: 'Maximize Code editor' }).click();
        expect(await page.locator('#code-panel').boundingBox()).toEqual({ x: 0, y: 0, width, height });
        await page.locator('.code-ai summary').scrollIntoViewIfNeeded();
        expect(await page.locator('.code-ai summary').isVisible()).toBe(true);
        await page.getByRole('button', { name: 'Restore Code panel' }).click();
        for (const view of ['editor-chat', 'editor-chat-preview']) {
          await page.getByRole('combobox', { name: 'Code view' }).selectOption(view);
          const code = (await page.locator('#code-panel').boundingBox())!;
          const chat = (await page.locator('#panel').boundingBox())!;
          expect(await page.locator('#panel').isVisible()).toBe(true);
          expect(await page.locator('#tools').isVisible()).toBe(false);
          if (width > 600) {
            expect(code.x).toBe(chat.width);
            expect(code.width + chat.width).toBe(width);
            expect(code.height).toBe(height);
          } else {
            expect(code.width).toBe(width);
            expect(chat.width).toBe(width);
            expect(chat.y).toBe(code.height);
          }
          if (view === 'editor-chat-preview') {
            const preview = (await page.locator('#game').boundingBox())!;
            expect(await page.locator('#game').isVisible()).toBe(true);
            expect(preview.y).toBe(chat.y + chat.height);
            expect(preview.y + preview.height).toBe(height);
            expect(preview.x).toBe(chat.x);
            expect(preview.width).toBe(chat.width);
          } else {
            expect(await page.locator('#game').isVisible()).toBe(false);
            expect(chat.y + chat.height).toBe(height);
          }
          await page.locator('#prompt').scrollIntoViewIfNeeded();
          await page.locator('#prompt').fill('Czy możesz zachować stan rozgrywki oraz wszystkie niezapisane zmiany?');
          expect(await page.locator('#prompt').isVisible()).toBe(true);
          await page.locator('.code-ai summary').scrollIntoViewIfNeeded();
          expect(await page.locator('.code-ai summary').isVisible()).toBe(true);
          expect(await page.locator('.cm-content').innerText()).toContain('layout draft');
          expect(await retainedEditor.evaluate((node) => node === document.querySelector('.cm-content'))).toBe(true);
          await page.getByRole('button', { name: 'Maximize Code editor' }).click();
          await page.getByRole('button', { name: 'Restore Code panel' }).click();
          expect(await page.locator('#code-panel').getAttribute('data-view')).toBe(view);
          await page.getByRole('combobox', { name: 'Code view' }).selectOption('panel');
        }
      }
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.getByRole('combobox', { name: 'Code view' }).selectOption('editor-chat');
      expect(await page.locator('#prompt').evaluate((node) => node === document.activeElement)).toBe(true);
      await page.keyboard.press('Escape');
      expect(await page.locator('#panel').isVisible()).toBe(false);
      expect(await page.locator('#code-panel').getAttribute('data-view')).toBe('editor');
      expect(await page.locator('#code-panel').boundingBox()).toEqual({ x: 0, y: 0, width: 1440, height: 1000 });
      await page.getByRole('combobox', { name: 'Code view' }).selectOption('game');
      expect(await page.locator('#code-panel').isVisible()).toBe(false);
      expect(await page.locator('#panel').isVisible()).toBe(false);
      expect(await page.locator('#game').boundingBox()).toEqual({ x: 0, y: 0, width: 1440, height: 1000 });
      await page.getByRole('button', { name: 'Show Play controls' }).click();
      await page.click('#code-open');
      expect(await page.locator('.cm-content').innerText()).toContain('layout draft');
      await page.click('.cm-content');
      await page.keyboard.press('Control+z');
      expect(await page.locator('.cm-content').innerText()).not.toContain('layout draft');
      await page.getByRole('button', { name: 'Maximize Code editor' }).click();
      await page.getByRole('button', { name: 'Close Code', exact: true }).click();
      expect(await page.locator('#tools').isVisible()).toBe(true);
      await page.click('#code-open');
      expect(await page.locator('#code-panel').getAttribute('data-maximized')).toBe('false');
      expect(await game.locator('body').evaluate(() => (window as unknown as { boot: string }).boot)).toBe(boot);
      expect(
        await game
          .locator('body')
          .evaluate(
            () =>
              (
                window as unknown as { __GAME_HARNESS__: { snapshotState(): { score: number } } }
              ).__GAME_HARNESS__.snapshotState().score,
          ),
      ).toBe(8);
      expect(await page.locator('#game').getAttribute('sandbox')).toBe('allow-scripts allow-pointer-lock');
    } finally {
      await browser.close();
      await fixture.close();
    }
  },
);
