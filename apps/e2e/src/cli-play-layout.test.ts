import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser, Page } from 'playwright-core';
import { SESSION_BROWSER_PAGE } from '../../cli/src/session-browser-page.js';
import { browserPrerequisite, launchSiteBrowser } from './browser.js';
import { chooseCodeView } from './play-code-fixture.js';

const prerequisite = browserPrerequisite();
if (!prerequisite.ok) console.warn(`[e2e] SKIPPED CLI Play layout: ${prerequisite.reason}`);
let browser: Browser;
const sizes = [
  [320, 568],
  [375, 667],
  [667, 375],
  [844, 390],
  [390, 360],
  [1024, 768],
  [1280, 720],
];
const game = `<!doctype html><style>html,body{margin:0;height:100%;background:#24352f;color:white}header{padding:8px}button{position:absolute;bottom:8px;right:8px}</style><header>Game HUD</header><button>Game action</button><script>
addEventListener('message',event=>{
  const m=event.data;if(m?.source!=='gdpl-workbench')return;
  const data=m.type==='capabilities'?{ready:true,state:true,validate:true,safe:true}:m.type==='snapshot'?{score:1}:true;
  parent.postMessage({source:'gdpl-workbench-game',id:m.id,data},'*');
});
addEventListener('keydown',event=>document.body.dataset.key=event.key);
</script>`;

async function fixture(width: number, height: number, agent = false) {
  const page = await browser.newPage({ viewport: { width, height } });
  let updateReady = false;
  page.on('pageerror', (error) => console.error(error));
  await page.route('http://localhost/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/') return route.fulfill({ contentType: 'text/html', body: SESSION_BROWSER_PAGE });
    if (path.startsWith('/code/'))
      return route.fulfill({ status: 404, json: { error: 'No editable checkout in layout fixture' } });
    const state = {
      sessionId: 'layout',
      sourceId: 1,
      hasPreview: true,
      mode: 'prompt',
      promptId: 1,
      taskId: 0,
      identity: 'gtanczyk · bardzo-dluga-nazwa-gry-do-sprawdzenia-ukladu',
      activity: 'Ready',
      localTask: '',
      question: '',
      choices: [],
      lines: ['› Sprawdź układ na telefonie.', '◆ Gotowe do kolejnej zmiany.'],
      live: [],
      queued: [],
      history: [],
      actionCommands: { status: '/status' },
      addresses: [],
      workspace: { mode: 'game', slug: 'layout' },
      ...(agent
        ? {
            agent: {
              name: 'Play',
              mode: 'use',
              modes: ['use'],
              agent: 'claude',
              agents: [],
              actions: [],
              links: [],
              view: null,
              navigation: null,
              history: [],
              session: {
                agent: 'claude',
                cwd: '/game',
                status: 'running',
                queued: [],
                approvals: [],
                usage: {},
                canSteer: true,
                turns: [
                  {
                    id: 1,
                    agent: 'claude',
                    prompt: 'Popraw sterowanie.',
                    startedAt: Date.now(),
                    entries: [
                      {
                        kind: 'tool',
                        name: 'AskUserQuestion',
                        input: {
                          questions: [
                            {
                              question: 'Które sterowanie wybrać?',
                              options: [{ label: 'Klawiatura', description: 'Sterowanie klawiszami' }],
                            },
                          ],
                        },
                        output: 'The user did not answer the questions.',
                        done: true,
                      },
                    ],
                  },
                ],
              },
            },
          }
        : {}),
    };
    const data =
      path === '/state'
        ? state
        : path === '/preview/status'
          ? { sourceId: 1, revision: updateReady ? 'two' : 'one' }
          : path === '/preview/game'
            ? { sourceId: 1, revision: 'one', html: game }
            : {};
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(data) });
  });
  await page.goto('http://localhost/#' + 'a'.repeat(64));
  await page.waitForFunction(() => document.getElementById('shown-build')?.textContent === 'Build one', undefined, {
    timeout: 10000,
  });
  updateReady = true;
  await page.evaluate(() => {
    document.getElementById('notice')!.textContent = '';
    document.getElementById('apply')!.hidden = false;
    document.getElementById('restart')!.hidden = false;
  });
  return page;
}

async function box(page: Page, selector: string) {
  const bounds = await page.locator(selector).boundingBox();
  if (!bounds) throw Error(`Missing visible ${selector}`);
  return bounds;
}

async function visibleInside(page: Page, selector: string, width: number, height: number) {
  const bounds = await box(page, selector);
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(width + 1);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(height + 1);
  return bounds;
}

describe.skipIf(!prerequisite.ok)('CLI Play browser layout', () => {
  beforeAll(async () => {
    browser = await launchSiteBrowser();
  });
  afterAll(async () => {
    await browser?.close();
  });

  it('focuses the game and accepts keyboard input after refreshing', async () => {
    const page = await fixture(1280, 720);
    try {
      await page.reload();
      await page.waitForFunction(() => document.getElementById('shown-build')?.textContent === 'Build one');
      await expect.poll(() => page.locator('#game').evaluate((frame) => document.activeElement === frame)).toBe(true);
      await page.keyboard.press('ArrowDown');
      await expect.poll(() => page.frameLocator('#game').locator('body').getAttribute('data-key')).toBe('ArrowDown');
    } finally {
      await page.close();
    }
  });

  it.each(sizes)('keeps controls, updates and chat reachable at %i × %i', async (width, height) => {
    const page = await fixture(width!, height!);
    try {
      const mobile = width! <= 600 || (width! <= 900 && height! <= 520);
      const toolbar = await visibleInside(page, '#tools', width!, height!);
      const controls = ['apply', 'restart', 'devices-open', 'commands-open', 'code-open', 'clean', 'edit'];
      if (!mobile) controls.push('fullscreen');
      const buttons = [];
      for (const id of controls) {
        const bounds = await visibleInside(page, '#' + id, width!, height!);
        buttons.push(bounds);
        expect(await page.locator('#' + id).getAttribute('aria-label')).toBeTruthy();
        if (mobile) expect(bounds.height).toBeGreaterThanOrEqual(44);
      }
      if (mobile) {
        expect(toolbar.height).toBe(52);
        expect(new Set(buttons.map((b) => b.y)).size).toBe(1);
        expect((await box(page, '#game')).y).toBe(toolbar.y + toolbar.height);
      }
      await page.locator('#code-open').click();
      const code = await visibleInside(page, '#code-panel', width!, height!);
      expect(code.y).toBeGreaterThanOrEqual(toolbar.y + toolbar.height);
      await page.getByRole('button', { name: 'Close Code', exact: true }).click();
      await page.locator('#commands-open').click();
      if (mobile) {
        await page.locator('#drawer-fullscreen').scrollIntoViewIfNeeded();
        await visibleInside(page, '#drawer-fullscreen', width!, height!);
      }
      await page.locator('#drawer-close').click();
      await page.locator('#edit').click();
      const panel = await visibleInside(page, '#panel', width!, height!);
      expect(panel.y).toBeGreaterThanOrEqual(toolbar.y + toolbar.height);
      expect(await page.locator('#panel-resize').isVisible()).toBe(!mobile);
      const screenshots = process.env.CLI_PLAY_LAYOUT_SCREENSHOTS;
      if (screenshots && width === 667) {
        await page.locator('#close').click();
        await page.screenshot({ path: `${screenshots}/play-landscape.png` });
        await page.locator('#edit').click();
      }
      await page.locator('#prompt').fill('Proszę poprawić sterowanie i zachować stan gry.');
      await page.locator('#send').scrollIntoViewIfNeeded();
      await visibleInside(page, '#send', width!, height!);
      await page.locator('#attachments-open').scrollIntoViewIfNeeded();
      await page.locator('#attachments-open').click();
      await visibleInside(page, '#workbench-tools', width!, height!);
      await page.locator('#drawer-close').click();
      await page.locator('#clean').click();
      const stage = await box(page, '#game');
      expect(stage.y).toBe(0);
      expect(stage.height).toBe(height);
      const reveal = await visibleInside(page, '#reveal', width!, height!);
      if (mobile) {
        expect(reveal.width).toBe(32);
        expect(reveal.height).toBe(44);
        expect(reveal.x + reveal.width).toBe(width);
      }
      if (screenshots && width === 667) await page.screenshot({ path: `${screenshots}/play-landscape-clean.png` });
      await page.locator('#reveal').click();
      expect(await page.locator('#tools').isVisible()).toBe(true);
      expect(await page.locator('#reveal').isVisible()).toBe(false);
    } finally {
      await page.close();
    }
  });

  it.each([
    [390, 360],
    [667, 375],
  ])('preserves editor focus views at %i × %i', async (width, height) => {
    const page = await fixture(width!, height!);
    try {
      const frame = await page.locator('#game').elementHandle();
      await page.locator('#code-open').click();
      for (const view of ['editor', 'editor-chat', 'editor-chat-preview']) {
        await chooseCodeView(page, view);
        await page.waitForFunction((view) => document.getElementById('code-panel')?.dataset.view === view, view);
        const code = await visibleInside(page, '#code-panel', width!, height!);
        expect(await page.locator('#tools').isVisible()).toBe(false);
        if (view === 'editor') {
          expect(code).toEqual({ x: 0, y: 0, width, height });
        } else {
          const chat = await visibleInside(page, '#panel', width!, height!);
          if (width! <= 600) {
            expect(chat.y).toBeCloseTo(code.y + code.height, 1);
            expect(chat.width).toBe(width);
          } else {
            expect(code.width + chat.width).toBeCloseTo(width!, 1);
            expect(chat.x).toBeCloseTo(code.x + code.width, 1);
          }
          if (view === 'editor-chat-preview') {
            const preview = await visibleInside(page, '#game', width!, height!);
            expect(preview.y).toBeCloseTo(chat.y + chat.height, 1);
            expect(preview.y + preview.height).toBeCloseTo(height!, 1);
          } else expect(await page.locator('#game').isVisible()).toBe(false);
        }
        expect(await frame!.evaluate((node) => node === document.getElementById('game'))).toBe(true);
      }
    } finally {
      await page.close();
    }
  });

  it.each([
    [390, 667],
    [844, 390],
  ])('keeps floating Code inside safe insets with either conversation dock at %i × %i', async (width, height) => {
    const page = await fixture(width!, height!);
    try {
      // Force phone safe-area env values; desktop Chromium otherwise reports zero.
      const safe = { left: 44, right: 34 };
      await page.evaluate((safe) => {
        for (const style of document.querySelectorAll('style')) {
          style.textContent = style
            .textContent!.replaceAll('env(safe-area-inset-left)', `${safe.left}px`)
            .replaceAll('env(safe-area-inset-right)', `${safe.right}px`);
        }
      }, safe);
      await page.locator('#edit').click();
      for (const dock of ['right', 'left']) {
        if (dock === 'left') await page.locator('#dock').click();
        await page.locator('#code-open').click();
        const code = await visibleInside(page, '#code-panel', width!, height!);
        expect(code.x).toBeGreaterThanOrEqual(safe.left);
        expect(code.x + code.width).toBeLessThanOrEqual(width! - safe.right);
        const close = await visibleInside(page, '[aria-label="Close Code"]', width!, height!);
        expect(close.x + close.width).toBeLessThanOrEqual(width! - safe.right);
        await page.locator('[aria-label="Close Code"]').click();
      }
    } finally {
      await page.close();
    }
  });

  it('keeps chat above long notices when the viewport shrinks for a keyboard', async () => {
    const page = await fixture(390, 667);
    try {
      await page.locator('#edit').click();
      await page.evaluate(() => {
        document.getElementById('notice')!.textContent =
          'Aktualizacja nie powiodła się. Zachowano poprzednią wersję gry i wpisaną wiadomość. '.repeat(8);
      });
      await page.setViewportSize({ width: 390, height: 360 });
      await page.waitForFunction(() => document.body.dataset.compact === 'true');
      await page.locator('#send').scrollIntoViewIfNeeded();
      const send = await visibleInside(page, '#send', 390, 360);
      const notice = await box(page, '#preview-feedback');
      expect(send.y + send.height).toBeLessThanOrEqual(notice.y);
      await page.locator('#close').click();
      await page.locator('#commands-open').click();
      const drawer = await visibleInside(page, '#workbench-tools', 390, 360);
      expect(drawer.y + drawer.height).toBeLessThanOrEqual(notice.y);
    } finally {
      await page.close();
    }
  });

  it('reserves space for a build error only when it overlaps the conversation', async () => {
    const page = await fixture(1280, 720);
    try {
      await page.locator('#edit').click();
      await page.route('http://localhost/preview/status', async (route) => {
        await route.fulfill({ json: { sourceId: 1, revision: 'one', error: 'Build error\n'.repeat(40) } });
      });
      await page.locator('#build-error').waitFor({ state: 'visible' });
      await page.waitForFunction(
        () => parseFloat(getComputedStyle(document.body).getPropertyValue('--notice-space')) > 0,
      );
      const before = await box(page, '#panel');
      await page.locator('#build-error-details summary').click();
      await expect.poll(async () => (await box(page, '#preview-feedback')).height).toBeGreaterThan(200);
      if (process.env.CLI_PLAY_LAYOUT_SCREENSHOTS)
        await page.screenshot({ path: `${process.env.CLI_PLAY_LAYOUT_SCREENSHOTS}/play-build-error.png` });
      expect((await box(page, '#panel')).height).toBeCloseTo(before.height, 1);
      expect((await box(page, '#panel-resize')).height).toBeCloseTo(before.height, 1);

      await page.locator('#dock').click();
      await expect.poll(async () => (await box(page, '#panel')).height).toBeLessThan(before.height);
      expect((await box(page, '#panel')).y + (await box(page, '#panel')).height).toBeLessThanOrEqual(
        (await box(page, '#preview-feedback')).y,
      );
      await page.locator('#dock').click();
      await expect.poll(async () => (await box(page, '#panel')).height).toBeCloseTo(before.height, 1);

      await page.setViewportSize({ width: 390, height: 360 });
      await expect
        .poll(async () => (await box(page, '#panel')).y + (await box(page, '#panel')).height)
        .toBeLessThanOrEqual((await box(page, '#preview-feedback')).y);
      await page.locator('#send').scrollIntoViewIfNeeded();
      await visibleInside(page, '#send', 390, 360);
    } finally {
      await page.close();
    }
  });

  it('keeps the agent conversation and question details usable', async () => {
    const page = await fixture(1280, 720, true);
    try {
      await page.locator('#edit').click();
      await page.locator('.gc-fold > summary').click();
      await page.locator('.gc-tool > summary').click();
      expect(await page.locator('.gc-tool pre').textContent()).toContain('Które sterowanie wybrać?');
      expect(await page.locator('.gc-tool pre').textContent()).toContain('Klawiatura — Sterowanie klawiszami');
      await page.locator('#prompt').fill('Czy możesz wyjaśnić to pytanie?');
      await visibleInside(page, '#send', 1280, 720);
      if (process.env.CLI_PLAY_LAYOUT_SCREENSHOTS)
        await page.screenshot({ path: `${process.env.CLI_PLAY_LAYOUT_SCREENSHOTS}/play-agent-chat.png` });
    } finally {
      await page.close();
    }
  });
});
