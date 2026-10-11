import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright-core';
import { SESSION_BROWSER_PAGE } from '../../cli/src/session-browser-page.js';
import { sessionDiff } from '../../cli/src/session-diff.js';
import { browserPrerequisite, launchSiteBrowser } from './browser.js';

const prerequisite = browserPrerequisite();
if (!prerequisite.ok) console.warn(`[e2e] SKIPPED CLI diff view: ${prerequisite.reason}`);
let browser: Browser;

describe.skipIf(!prerequisite.ok)('CLI diff flyout', () => {
  beforeAll(async () => {
    browser = await launchSiteBrowser();
  });
  afterAll(async () => {
    await browser?.close();
  });

  it.each([
    [1280, 720],
    [390, 667],
    [667, 375],
    [390, 360],
  ])('keeps patches out of chat at %i × %i', async (width, height) => {
    const page = await browser.newPage({ viewport: { width: width!, height: height! } });
    const diff = sessionDiff(
      [
        'Diff: platform → local',
        '',
        '--- platform/game.ts',
        '+++ local/game.ts',
        '@@ -1 +1 @@',
        '-const title = `stara wersja`;',
        ...Array.from({ length: 150 }, (_, i) => `+const bardzoDlugaNazwaPliku${i} = "${'ź'.repeat(180)}";`),
      ].join('\n'),
      1,
    )!;
    await page.route('http://localhost/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/') return route.fulfill({ contentType: 'text/html', body: SESSION_BROWSER_PAGE });
      const data =
        path === '/state'
          ? {
              mode: 'prompt',
              promptId: 1,
              taskId: 0,
              question: '',
              choices: [],
              localTask: '',
              live: [],
              queued: [],
              lines: ['› /diff', diff.summary, 'Round status: in_review'],
              diffs: [{ id: diff.id, summary: diff.summary, files: diff.files }],
              sessionId: 'diff',
              hasPreview: false,
              actionCommands: {},
              addresses: [],
              history: [],
              workspace: { mode: 'game', slug: 'example' },
            }
          : path === '/diff/1'
            ? diff
            : {};
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
    });
    try {
      await page.goto('http://localhost/#' + 'a'.repeat(64));
      await page.waitForSelector('.diff-flyout[open]');
      await page.waitForFunction(() =>
        document.querySelector('.diff-content')?.textContent?.includes('bardzoDlugaNazwaPliku149'),
      );
      if (height === 360) {
        await page.evaluate(() => {
          document.getElementById('notice')!.textContent =
            'Aktualizacja nie powiodła się. Zachowano poprzednią wersję gry. '.repeat(8);
        });
        await page.waitForFunction(() => document.body.style.getPropertyValue('--notice-space') !== '0px');
      }
      const bounds = await page.locator('.diff-flyout').boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.y).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width! + 1);
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(height! + 1);
      if (height === 360) {
        const notice = await page.locator('#preview-feedback').boundingBox();
        expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(notice!.y + 1);
      }
      expect(await page.locator('.diff-content').evaluate((node) => node.scrollHeight > node.clientHeight)).toBe(true);
      expect(await page.locator('.diff-content').textContent()).toContain('`stara wersja`');
      expect(await page.locator('#conversation').textContent()).not.toContain('bardzoDlugaNazwaPliku');
      expect(await page.locator('#conversation').textContent()).toContain('Round status: in_review');
      await page.keyboard.press('Escape');
      await page.waitForSelector('.diff-flyout', { state: 'detached' });
      await page.locator('#edit').click();
      await page.locator('#prompt').fill('Zachowaj moją wiadomość.');
      await page.getByRole('button', { name: 'View diff' }).click();
      await page.getByRole('button', { name: 'Close diff' }).click();
      expect(await page.locator('#prompt').inputValue()).toBe('Zachowaj moją wiadomość.');
      expect(await page.getByRole('button', { name: 'View diff' }).isVisible()).toBe(true);
    } finally {
      await page.close();
    }
  });
});
