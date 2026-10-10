import { chromium } from 'playwright-core';
import { expect, it } from 'vitest';
import { findChromium } from './browser.js';
import { chromiumSandbox } from './sandbox.js';
import { playCodeFixture } from './play-code-fixture.js';

const executablePath = findChromium();
it.skipIf(!executablePath)(
  'uses funded ghost text only after opt-in, without browser account credentials',
  async () => {
    const fixture = await playCodeFixture(true);
    const browser = await chromium.launch({
      executablePath: executablePath!,
      headless: true,
      chromiumSandbox: chromiumSandbox().enabled,
      args: ['--disable-dev-shm-usage'],
    });
    try {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      const requests: string[] = [];
      page.on('request', (request) => requests.push(request.url()));
      await page.goto(fixture.url);
      await page.click('#code-open');
      await page.waitForSelector('.cm-content');
      await page.waitForFunction(() =>
        document.querySelector('.code-status')?.textContent?.includes('TypeScript ready'),
      );
      await page.click('.cm-content');
      await page.keyboard.press('Control+End');
      await page.keyboard.insertText('\nconst localAnswer');
      expect(fixture.completions).toHaveLength(0);
      await page.click('.code-ai summary');
      await page.selectOption('#code-provider', 'gamedev');
      const enable = page.getByRole('button', { name: 'Enable AI completion' });
      expect(await enable.isDisabled()).toBe(true);
      await page.locator('.code-consent input').check();
      await enable.click();
      await page.click('.cm-content');
      await page.keyboard.press('Control+End');
      await page.keyboard.type(' ');
      await page.waitForSelector('.cm-ghost-text', { timeout: 15000 });
      expect(await page.locator('.cm-ghost-text').innerText()).toContain('42');
      await page.keyboard.press('Tab');
      expect(await page.locator('.cm-content').innerText()).toContain('42');
      expect(fixture.completions.length).toBeGreaterThan(0);
      await page.getByRole('button', { name: 'Disable AI completion' }).click();
      await expect.poll(() => page.locator('.cm-ghost-text').count()).toBe(0);
      expect(requests.some((url) => url.includes('/api/') || url.includes('mock-account'))).toBe(false);
    } finally {
      await browser.close();
      await fixture.close();
    }
  },
);
