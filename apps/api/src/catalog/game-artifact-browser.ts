import { existsSync } from 'node:fs';
import { chromium, type Browser } from 'playwright-core';
import { gameHtmlHash, type GameArtifact, type VerifyGameArtifact } from './game-artifact.js';

type GamePage = {
  __GAME_HARNESS__?: { ready?: boolean; frame?: number };
  document: { querySelector(selector: string): { width: number; height: number } | null };
};

export async function createGameArtifactBrowser(options: {
  executablePath: string;
  noSandbox?: boolean;
  timeoutMs?: number;
}): Promise<{ verify: VerifyGameArtifact; close(): Promise<void> }> {
  if (!options.executablePath || !existsSync(options.executablePath))
    throw new Error('Game artifact gate requires Chromium');
  const browser: Browser = await chromium.launch({
    executablePath: options.executablePath,
    headless: true,
    chromiumSandbox: !options.noSandbox,
  });
  const timeout = options.timeoutMs ?? 30_000;
  const verify = async (artifact: GameArtifact) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, serviceWorkers: 'block' });
    try {
      await context.route('**/*', (route) => route.abort());
      const page = await context.newPage();
      page.setDefaultTimeout(timeout);
      const errors: string[] = [];
      let failed!: (error: Error) => void;
      const error = new Promise<never>((_resolve, reject) => {
        failed = reject;
      });
      page.on('pageerror', (cause) => {
        errors.push(cause.message);
        failed(new Error(`Game JavaScript error: ${cause.message}`));
      });
      const probe = async () => {
        await page.setContent(
          '<iframe sandbox="allow-scripts allow-pointer-lock" style="width:100%;height:700px"></iframe>',
        );
        await page.locator('iframe').evaluate((node, html) => {
          (node as unknown as { srcdoc: string }).srcdoc = html;
        }, artifact.html);
        const frame = page.frames().find((candidate) => candidate !== page.mainFrame());
        if (!frame) throw new Error('Game artifact has no frame');
        await frame.waitForFunction(
          () => {
            const harness = (globalThis as unknown as GamePage).__GAME_HARNESS__;
            const canvas = (globalThis as unknown as GamePage).document.querySelector('canvas');
            return harness?.ready && (harness.frame ?? 0) >= 3 && canvas && canvas.width > 0 && canvas.height > 0;
          },
          undefined,
          { timeout },
        );
        const before = await frame.evaluate(() => (globalThis as unknown as GamePage).__GAME_HARNESS__!.frame!);
        await page.locator('iframe').focus();
        await page.keyboard.press('Enter');
        await page.keyboard.press('Space');
        await frame.waitForFunction(
          (previous) => ((globalThis as unknown as GamePage).__GAME_HARNESS__?.frame ?? 0) >= previous + 3,
          before,
          { timeout },
        );
        const frames = await frame.evaluate(() => (globalThis as unknown as GamePage).__GAME_HARNESS__!.frame!);
        if (errors.length) throw new Error(`Game JavaScript error: ${errors[0]}`);
        return { engineRef: artifact.engineRef, htmlSha256: gameHtmlHash(artifact.html), frames };
      };
      return await Promise.race([probe(), error]);
    } finally {
      await context.close();
    }
  };
  return { verify, close: () => browser.close() };
}
