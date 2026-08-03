/**
 * Does the built document actually run?
 *
 * The lane cannot answer this and neither can esbuild: step 6 transpiles
 * TypeScript without checking it, so a wrong property name, a missing field or a
 * changed shape compiles perfectly and throws on the first frame. This loads the
 * assembled document in a real browser, drives it through GameKit's deterministic
 * `__GAME_HARNESS__.step()`, and reports what was thrown.
 *
 * Calibrate before you trust it: judge the *unedited* game too. A game that was
 * already broken is not the lane's fault, and a judge that cannot tell the
 * difference would blame it anyway.
 *
 *   tsx scripts/remix-lane-judge.ts out.html [more.html ...] --json verdicts.json
 */

import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { chromium, type Browser } from 'playwright-core';

/** Pinned: the cache holds 1228 while the bundled default expects a newer build. */
const EXECUTABLE_PATH =
  process.env.CHROME_PATH ??
  `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-mac-arm64/chrome-headless-shell`;

/**
 * 20 seconds of game time at 60fps, stepped deterministically (no wall clock).
 *
 * Generous on purpose: the most interesting failures are not on frame one. A
 * miscomputed score or combo only reaches the screen on the win/lose overlay, so
 * a run that never finishes a round never sees them — 240 frames scored a game
 * that paints "best combo: xNaN" as a clean pass.
 */
const FRAMES = 1200;

export interface Verdict {
  file: string;
  /** `works` | `throws` | `garbled` | `never_ready` | `load_error` */
  status: string;
  errors: string[];
  frames: number;
  state?: string;
  /** Text the game actually painted that reads as a bug to a player. */
  garbled?: string[];
}

/**
 * Catch the failure that does not throw.
 *
 * When an edit adds a field the type never declared — the commonest shape the
 * lane produces, because call 2 cannot edit the type it does not see — reading
 * it yields `undefined` rather than an error. `undefined` in arithmetic is
 * `NaN`, and the game runs happily to completion painting "x NaN" on the HUD.
 * Nothing throws, so a crash-only judge scores it a success; the player sees a
 * broken feature. Watching what the game paints is what tells the difference.
 */
const WATCH_PAINTED_TEXT = `
(() => {
  const painted = [];
  window.__PAINTED_GARBAGE__ = painted;
  const record = (text) => {
    const value = String(text);
    if (/NaN|undefined|\\[object Object\\]/.test(value) && !painted.includes(value)) painted.push(value);
  };
  const wrap = (proto, method) => {
    if (!proto || typeof proto[method] !== 'function') return;
    const original = proto[method];
    proto[method] = function (text, ...rest) {
      record(text);
      return original.call(this, text, ...rest);
    };
  };
  wrap(CanvasRenderingContext2D.prototype, 'fillText');
  wrap(CanvasRenderingContext2D.prototype, 'strokeText');
})();
`;

export async function judge(browser: Browser, file: string): Promise<Verdict> {
  const context = await browser.newContext({ viewport: { width: 480, height: 720 } });
  const page = await context.newPage();
  // Before any game script runs, so the very first painted frame is watched.
  await page.addInitScript(WATCH_PAINTED_TEXT);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(`${error.name}: ${error.message}`.slice(0, 300)));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`.slice(0, 300));
  });

  try {
    await page.goto(`file://${path.resolve(file)}`, { waitUntil: 'load', timeout: 15_000 });

    // Mount is async in the game's own hands; if it never happens, the failure is
    // in module scope or in mount itself, and the errors already tell us why.
    let ready = false;
    try {
      await page.waitForFunction(() => (window as never as { __GAME_HARNESS__?: { ready?: boolean } }).__GAME_HARNESS__?.ready === true, {
        timeout: 6000,
      });
      ready = true;
    } catch {
      ready = false;
    }
    if (!ready) {
      return { file, status: errors.length ? 'throws' : 'never_ready', errors: dedupe(errors), frames: 0 };
    }

    // Most games open on an intro and wait for a press. Give them a real one —
    // synthetic input is the only way past the gate, and everything interesting
    // (round setup, spawning, scoring) lives on the other side of it.
    const canvas = page.locator('canvas').first();
    if (await canvas.count()) {
      await canvas.click({ position: { x: 240, y: 360 }, force: true }).catch(() => {});
    }
    await page.keyboard.press('Space').catch(() => {});
    await page.keyboard.press('Enter').catch(() => {});

    const stepped = await page.evaluate(async (frames) => {
      const harness = (window as never as { __GAME_HARNESS__: { step(dt: number): unknown } }).__GAME_HARNESS__;
      const thrown: string[] = [];
      let count = 0;
      for (let index = 0; index < frames; index += 1) {
        try {
          harness.step(1 / 60);
          count += 1;
        } catch (error) {
          thrown.push(String(error).slice(0, 300));
          break;
        }
        // Drive a little input so movement, firing and round transitions are
        // actually exercised rather than sitting on a title screen.
        if (index % 30 === 0) {
          for (const key of ['ArrowRight', 'ArrowUp', ' ']) {
            window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
            window.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }));
          }
          const target = document.querySelector('canvas') ?? document.body;
          for (const type of ['pointerdown', 'pointerup', 'click']) {
            target.dispatchEvent(
              new PointerEvent(type, { bubbles: true, clientX: 240, clientY: 360, pointerId: 1, isPrimary: true }),
            );
          }
        }
      }
      let state: string | undefined;
      try {
        const kit = (window as never as { GameKit?: { snapshot?: () => { state?: string } } }).GameKit;
        state = kit?.snapshot?.()?.state;
      } catch {
        state = undefined;
      }
      return { count, thrown, state };
    }, FRAMES);

    errors.push(...stepped.thrown);
    const all = dedupe(errors);
    if (process.env.SHOT_DIR) {
      await page.screenshot({ path: `${process.env.SHOT_DIR}/${path.basename(file, '.html')}.png` });
    }
    const garbled = await page.evaluate(
      () => (window as never as { __PAINTED_GARBAGE__?: string[] }).__PAINTED_GARBAGE__ ?? [],
    );
    return {
      file,
      status: all.length ? 'throws' : garbled.length ? 'garbled' : 'works',
      errors: all,
      frames: stepped.count,
      ...(stepped.state ? { state: stepped.state } : {}),
      ...(garbled.length ? { garbled: garbled.slice(0, 6) } : {}),
    };
  } catch (error) {
    return { file, status: 'load_error', errors: [String(error).slice(0, 300)], frames: 0 };
  } finally {
    await context.close();
  }
}

function dedupe(errors: string[]): string[] {
  return [...new Set(errors)].slice(0, 6);
}

async function main() {
  const argv = process.argv.slice(2);
  const jsonIndex = argv.indexOf('--json');
  const jsonPath = jsonIndex === -1 ? undefined : argv[jsonIndex + 1];
  const files = argv.filter(
    (argument, index) => !argument.startsWith('--') && !(jsonIndex !== -1 && index === jsonIndex + 1),
  );
  if (!files.length) {
    console.error('usage: remix-lane-judge <file.html> [...] [--json verdicts.json]');
    process.exit(1);
  }

  const browser = await chromium.launch({ executablePath: EXECUTABLE_PATH });
  const verdicts: Verdict[] = [];
  try {
    for (const file of files) {
      const verdict = await judge(browser, file);
      verdicts.push(verdict);
      const name = path.basename(file);
      console.log(
        `${verdict.status === 'works' ? '✓' : '✗'} ${name} — ${verdict.status} (${verdict.frames} frames${verdict.state ? `, ${verdict.state}` : ''})${verdict.errors.length ? `\n    ${verdict.errors.join('\n    ')}` : ''}${verdict.garbled ? `\n    painted: ${verdict.garbled.join(' | ')}` : ''}`,
      );
    }
  } finally {
    await browser.close();
  }

  if (jsonPath) await writeFile(jsonPath, JSON.stringify(verdicts, null, 2), 'utf8');
  const works = verdicts.filter((verdict) => verdict.status === 'works').length;
  console.log(`\n${works}/${verdicts.length} run clean`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
