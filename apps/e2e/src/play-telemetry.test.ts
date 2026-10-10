import { createServer, type Server } from 'node:http';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from 'playwright-core';
import { buildApp } from '../../api/src/platform/app.js';
import { InMemoryStore } from '../../api/src/platform/store.js';
import { mintSessionToken, SESSION_COOKIE_NAME } from '../../api/src/platform/auth.js';
import { createPublishedSlugGate } from '../../api/src/catalog/published-slugs.js';
import { summarizeFramePerformance } from '../../api/src/platform/frame-performance.js';
import { browserPrerequisite, launchSiteBrowser } from './browser.js';

const prerequisite = browserPrerequisite();
if (!prerequisite.ok) console.warn(`[e2e] SKIPPED play telemetry: ${prerequisite.reason}`);
const slug = 'telemetry-fixture';
const html = '<!doctype html><html><head></head><body><canvas width="640" height="400"></canvas></body></html>';
const artifactVersion = createHash('sha256').update(html).digest('hex');
const secret = 'dev-session-secret-change-me';
const store = new InMemoryStore();
let app: Awaited<ReturnType<typeof buildApp>>;
let server: Server;
let browser: Browser;
let baseUrl: string;
const served: string[] = [];

const entry = `
import React from 'react';
import {createRoot} from 'react-dom/client';
import {AuthProvider} from './src/AuthContext.js';
import {PublicPlayView} from './src/PublicPlayView.js';
import {ReviewDesk} from './src/surfaces/review/ReviewDesk.js';
import {StudioStage} from './src/surfaces/studio/StudioStage.js';
import {useStageSource} from './src/useStageSource.js';
import i18n, {i18nReady} from './src/i18n/index.js';
const mode = new URLSearchParams(location.search).get('mode');
const slug = 'telemetry-fixture';
function Studio() {
  const source = useStageSource('fixture-token', {status:'published',slug});
  return <StudioStage token="fixture-token" title="Telemetry fixture" slug={slug} published source={source}
    posture="play" covered={false} onPostureChange={()=>{}}/>;
}
window.validWindows = 0;
window.addEventListener('message', event => {
  if (event.data?.source === 'gdpl-player' && event.data?.type === 'alive' && event.data?.performance?.valid) window.validWindows++;
});
const root = createRoot(document.getElementById('mount'));
window.closeFixture = () => root.unmount();
await i18nReady;
await i18n.changeLanguage('en');
root.render(<AuthProvider>{mode === 'review' ? <ReviewDesk/> : mode === 'studio' ? <Studio/> :
  <PublicPlayView slug={slug} onExit={()=>root.unmount()}/>}</AuthProvider>);
`;

describe.skipIf(!prerequisite.ok)('published play telemetry through native Chromium and the API', () => {
  beforeAll(async () => {
    await store.upsertUser({ uid: 'g:reviewer' });
    app = await buildApp({
      store,
      sessionSecret: secret,
      reviewerUids: 'g:reviewer',
      telemetryRoutes: {
        publishedSlugs: createPublishedSlugGate({
          client: { getCatalog: async () => [{ slug, status: 'published' }] as never },
        }),
      },
    });
    const web = resolve(import.meta.dirname, '../../web');
    const bundle = await build({
      stdin: { contents: entry, resolveDir: web, sourcefile: 'play-telemetry-fixture.tsx', loader: 'tsx' },
      bundle: true,
      jsx: 'automatic',
      loader: { '.css': 'empty' },
      alias: { '@gamedevpl/contract': resolve(web, '../../packages/contract/src/index.ts') },
      write: false,
      platform: 'browser',
      format: 'esm',
      define: { 'process.env.NODE_ENV': '"production"', 'import.meta.env': '{}' },
    });
    const script = bundle.outputFiles[0]!.text;
    server = createServer(async (request, response) => {
      const url = request.url ?? '/';
      const mode = new URL(url, 'http://localhost').searchParams.get('mode');
      const send = (data: unknown, status = 200) => {
        response.writeHead(status, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify(data));
      };
      if (url === '/fixture.js') {
        response.writeHead(200, { 'Content-Type': 'text/javascript' });
        response.end(script);
      } else if (url === '/api/telemetry') {
        let payload = '';
        for await (const chunk of request) payload += chunk;
        const result = await app.inject({
          method: 'POST',
          url,
          headers: { cookie: request.headers.cookie ?? '' },
          payload: JSON.parse(payload),
        });
        response.writeHead(result.statusCode, { 'Content-Type': 'application/json' });
        response.end(result.body);
      } else if (url === '/api/auth/me') {
        send({ user: request.headers.cookie ? { uid: 'g:reviewer', reviewer: true } : null });
      } else if (url === '/api/health') {
        send({ privateBeta: false, publicPlaySlugs: [slug] });
      } else if (url === `/api/games/${slug}` || url.startsWith(`/api/review/games/${slug}`)) {
        served.push(url);
        send({ slug, title: 'Telemetry fixture', html, artifactVersion });
      } else if (url.startsWith('/api/review/queue')) {
        send({
          assessed: 0,
          remaining: 1,
          items: [
            {
              slug,
              title: 'Telemetry fixture',
              source: 'creator',
              gameVersion: 'candidate-v1',
              jobId: 42,
              creatorHandle: null,
              genre: null,
              media: { screenshots: [], video: null },
            },
          ],
        });
      } else if (url.startsWith('/api/')) {
        send({}, 404);
      } else {
        if (mode && mode !== 'public')
          response.setHeader(
            'Set-Cookie',
            `${SESSION_COOKIE_NAME}=${mintSessionToken('g:reviewer', secret)}; Path=/; HttpOnly; SameSite=Lax`,
          );
        response.writeHead(200, { 'Content-Type': 'text/html' });
        response.end(
          '<style>html,body,#mount{height:100%;margin:0}iframe{height:80vh;width:100%;border:0}</style><div id="mount"></div><script type="module" src="/fixture.js"></script>',
        );
      }
    });
    await new Promise<void>((ready) => server.listen(0, '127.0.0.1', ready));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing fixture address');
    baseUrl = `http://127.0.0.1:${address.port}`;
    browser = await launchSiteBrowser();
  });

  afterAll(async () => {
    await browser?.close();
    if (server) await new Promise<void>((done) => server.close(() => done()));
    await app?.close();
  });

  for (const mode of ['public', 'studio', 'review'] as const) {
    it(`persists device context and valid performance from ${mode}`, async () => {
      const date = new Date().toISOString().slice(0, 10);
      const previous = new Set((await store.listTelemetryEvents(date)).map((event) => event.sessionId));
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });
      const page = await context.newPage();
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      try {
        served.length = 0;
        await page.goto(`${baseUrl}/?mode=${mode}`);
        await page.waitForSelector('iframe', { timeout: 10_000 }).catch(async (error) => {
          console.info({ mode, errors, text: await page.locator('body').innerText() });
          throw error;
        });
        await page.bringToFront();
        await page.waitForFunction(() => (window as unknown as { validWindows: number }).validWindows > 0, undefined, {
          timeout: 25_000,
        });
        const gameFrame = page.frames().find((frame) => frame !== page.mainFrame())!;
        const frameDpr = await gameFrame.evaluate(() => devicePixelRatio);
        await page.evaluate(() => (window as unknown as { closeFixture: () => void }).closeFixture());
        await expect
          .poll(async () =>
            (await store.listTelemetryEvents(date)).some(
              (event) => !previous.has(event.sessionId) && event.type === 'game_closed',
            ),
          )
          .toBe(true);
        const events = (await store.listTelemetryEvents(date)).filter((event) => !previous.has(event.sessionId));
        const opened = events.find((event) => event.type === 'game_opened');
        expect(opened).toMatchObject({
          slug,
          artifactVersion,
          device: { deviceClass: 'desktop', displayDpr: 2 },
        });
        expect(opened?.reviewer ?? false).toBe(mode !== 'public');
        const report = summarizeFramePerformance(events);
        expect(report.groups).toHaveLength(1);
        expect(report.groups[0]).toMatchObject({ slug, artifactVersion, reviewer: mode !== 'public', dpr: frameDpr });
        expect(report.groups[0].windows).toBeGreaterThan(0);
        expect(served).toEqual([
          mode === 'review' ? `/api/review/games/${slug}?version=candidate-v1` : `/api/games/${slug}`,
        ]);
        expect(JSON.stringify(events)).not.toContain('g:reviewer');
        expect(errors).toEqual([]);
      } finally {
        await context.close();
      }
    });
  }
});
