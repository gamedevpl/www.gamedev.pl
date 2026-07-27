import { defineConfig, devices } from '@playwright/test';

/**
 * Post-deployment end-to-end checks (docs/deployment.md).
 *
 * These do not run in `ci-gate` and have no dev server: they drive a **deployed** URL,
 * normally the Cloud Run candidate revision before traffic is promoted to it. Unit tests
 * cover components; this covers the thing a visitor actually receives — the built bundle,
 * the CDN in front of it, and the assembled game document.
 *
 * Two suites with deliberately different consequences (see each spec's header):
 *   deploy-smoke.spec.ts — the website's own behaviour. Blocks promotion.
 *   gameplay.spec.ts     — whether a published game runs. Reports, never blocks.
 */

const baseURL = process.env.SMOKE_BASE_URL ?? 'http://127.0.0.1:3001';

export default defineConfig({
  testDir: '.',
  // One retry: these cross a real network to a scale-to-zero service, so a first-request
  // cold start is a normal event rather than a defect. More than one would start hiding
  // real flakiness instead of absorbing cold starts.
  retries: 1,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  // Serial: the whole point is a fast gate in front of a deploy, and the suite is small.
  workers: 1,
  forbidOnly: true,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  use: {
    baseURL,
    ...devices['Desktop Chrome'],
    // A failure here blocks a production deploy, so leave behind enough to diagnose it
    // without re-running: the trace is the difference between "it was red" and knowing why.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 10_000,
    // Playwright does not pick up HTTPS_PROXY by itself, and agent VMs route all egress
    // through one — without this the suite gets a proxy 403 that reads exactly like the
    // site refusing the request. CI has no proxy set, so this is inert there.
    ...(process.env.HTTPS_PROXY
      ? { proxy: { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1,::1' } }
      : {}),
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Agent VMs ship a Chromium that may not match this Playwright's expected build,
        // and re-downloading one is often blocked there. Point SMOKE_CHROMIUM_PATH at the
        // existing binary to reuse it; CI leaves this unset and uses the installed build.
        ...(process.env.SMOKE_CHROMIUM_PATH
          ? { launchOptions: { executablePath: process.env.SMOKE_CHROMIUM_PATH } }
          : {}),
      },
    },
  ],
});
