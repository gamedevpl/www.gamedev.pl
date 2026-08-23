import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { brotliCompressSync, gzipSync } from 'node:zlib';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './platform/app.js';
import { InMemoryStore } from './platform/store.js';

// Static serving of the web dist (production mode): precompressed variants are
// served as-is (zero runtime CPU — Cloud Run bills CPU) and cache headers are
// split by mutability: content-hashed /assets/* are immutable for a year,
// index.html (the rollout pivot) must always revalidate. The CDN in front of
// the service (docs/closed-beta-launch-plan.md) caches only what these headers
// allow, so weakening them silently disables edge caching.
describe('static web serving', () => {
  let app: FastifyInstance;
  let distDir: string;
  const indexHtml = '<!doctype html><html><body>gamedev.pl shell</body></html>';
  const assetJs = 'console.log("hashed bundle");'.repeat(10);

  beforeAll(async () => {
    distDir = mkdtempSync(path.join(tmpdir(), 'webdist-'));
    mkdirSync(path.join(distDir, 'assets'));
    writeFileSync(path.join(distDir, 'index.html'), indexHtml);
    writeFileSync(path.join(distDir, 'assets', 'index-AbCd1234.js'), assetJs);
    // Precompressed siblings, as apps/web/scripts/precompress.mjs produces.
    writeFileSync(path.join(distDir, 'assets', 'index-AbCd1234.js.br'), brotliCompressSync(assetJs));
    writeFileSync(path.join(distDir, 'assets', 'index-AbCd1234.js.gz'), gzipSync(assetJs));

    process.env.WEB_DIST_DIR = distDir;
    app = await buildApp({ store: new InMemoryStore(), sessionSecret: 'dev-session-secret-change-me' });
  });

  afterAll(async () => {
    delete process.env.WEB_DIST_DIR;
    await app.close();
    rmSync(distDir, { recursive: true, force: true });
  });

  it('serves hashed assets with immutable long-lived cache headers', async () => {
    const res = await app.inject({ method: 'GET', url: '/assets/index-AbCd1234.js' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable');
  });

  it('serves the precompressed brotli variant when the client accepts it', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/assets/index-AbCd1234.js',
      headers: { 'accept-encoding': 'br' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-encoding']).toBe('br');
    expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable');
  });

  it('serves the gzip variant for gzip-only clients', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/assets/index-AbCd1234.js',
      headers: { 'accept-encoding': 'gzip' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-encoding']).toBe('gzip');
  });

  it('serves index.html with no-cache so deploys roll out immediately', async () => {
    const res = await app.inject({ method: 'GET', url: '/index.html' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-cache');
  });

  it('serves known SPA deep links as 200 + index.html', async () => {
    const res = await app.inject({ method: 'GET', url: '/play/sky-dodge' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-cache');
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.body).toContain('gamedev.pl shell');
  });

  it('serves unknown paths as a proper HTTP 404 with the SPA shell', async () => {
    const res = await app.inject({ method: 'GET', url: '/some/spa/route' });
    expect(res.statusCode).toBe(404);
    expect(res.headers['cache-control']).toBe('no-cache');
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.body).toContain('gamedev.pl shell');
  });

  it('keeps missing static assets as hard 404s, not the HTML shell', async () => {
    const res = await app.inject({ method: 'GET', url: '/assets/missing-AbCd.js' });
    expect(res.statusCode).toBe(404);
    expect(res.body).not.toContain('gamedev.pl shell');
  });
});
