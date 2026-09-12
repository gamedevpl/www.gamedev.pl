import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { InMemoryStore } from './store.js';
import {
  APP_CSP_REPORT_ONLY,
  CSP_REPORT_PATH,
  FRAME_ANCESTORS_NONE,
  FRAME_ANCESTORS_PLAY,
  isPlayPermalinkPath,
  PERMISSIONS_POLICY,
  REFERRER_POLICY,
  resolveCspReportOnly,
  STRICT_TRANSPORT_SECURITY,
  summarizeCspReport,
  X_FRAME_OPTIONS,
} from './security-headers.js';

const sessionSecret = 'dev-session-secret-change-me';

// Pins the 2026-09-07 pentest fix and its limits.
describe('security headers', () => {
  let app: FastifyInstance;
  let distDir: string;

  beforeAll(async () => {
    distDir = mkdtempSync(path.join(tmpdir(), 'webdist-sec-'));
    writeFileSync(path.join(distDir, 'index.html'), '<!doctype html><html><body>shell</body></html>');
    process.env.WEB_DIST_DIR = distDir;
    app = await buildApp({ store: new InMemoryStore(), sessionSecret, betaAllowedUids: 'g:someone' });
  });

  afterAll(async () => {
    delete process.env.WEB_DIST_DIR;
    await app.close();
    rmSync(distDir, { recursive: true, force: true });
  });

  it.each(['/', '/admin', '/studio/x/connect'])('refuses to be framed on the shell at %s', async (url) => {
    const res = await app.inject({ method: 'GET', url });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/html/);
    expect(res.headers['content-security-policy']).toBe(FRAME_ANCESTORS_NONE);
    expect(res.headers['x-frame-options']).toBe(X_FRAME_OPTIONS);
    expect(res.headers['permissions-policy']).toBe(PERMISSIONS_POLICY);
    expect(res.headers['content-security-policy-report-only']).toBe(APP_CSP_REPORT_ONLY);
  });

  it('hardens the unknown-path 404 shell the same way', async () => {
    const res = await app.inject({ method: 'GET', url: '/definitely/not/a/route' });
    expect(res.statusCode).toBe(404);
    expect(res.headers['content-security-policy']).toBe(FRAME_ANCESTORS_NONE);
    expect(res.headers['x-frame-options']).toBe(X_FRAME_OPTIONS);
  });

  it.each(['/play/unicorn-snap', '/play/unicorn-snap?ref=js13k', '/ay/rainbow-surfer'])(
    'lets any parent frame the play permalink at %s',
    async (url) => {
      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-security-policy']).toBe(FRAME_ANCESTORS_PLAY);
      expect(res.headers['x-frame-options']).toBeUndefined();
    },
  );

  it('does not let a parent frame a typo play path', async () => {
    const res = await app.inject({ method: 'GET', url: '/play/' });
    expect(res.headers['content-security-policy']).toBe(FRAME_ANCESTORS_NONE);
    expect(res.headers['x-frame-options']).toBe(X_FRAME_OPTIONS);
  });

  it('puts baseline hardening headers on every response, JSON included', async () => {
    for (const url of ['/api/health', '/api/auth/me', '/']) {
      const res = await app.inject({ method: 'GET', url });
      expect(res.headers['x-content-type-options'], url).toBe('nosniff');
      expect(res.headers['referrer-policy'], url).toBe(REFERRER_POLICY);
      expect(res.headers['strict-transport-security'], url).toBe(STRICT_TRANSPORT_SECURITY);
    }
  });

  it('keeps the framing rule off non-HTML responses', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.headers['content-security-policy']).toBeUndefined();
    expect(res.headers['x-frame-options']).toBeUndefined();
    expect(res.headers['content-security-policy-report-only']).toBeUndefined();
  });

  it('protects the OAuth consent screen — the clickjacking target that matters most', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/oauth/authorize?client_id=x&redirect_uri=https%3A%2F%2Fexample.test%2Fcb&response_type=code&code_challenge=abc&code_challenge_method=S256',
    });
    // Signed out: a redirect or the page; HTML must carry the rule.
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    if (String(res.headers['content-type'] ?? '').startsWith('text/html')) {
      expect(res.headers['content-security-policy']).toBe(FRAME_ANCESTORS_NONE);
      expect(res.headers['x-frame-options']).toBe(X_FRAME_OPTIONS);
    }
  });

  it('leaves a route alone once it has written its own policy (the sandboxed preview)', async () => {
    const probe = await buildApp({ store: new InMemoryStore(), sessionSecret });
    const own = "sandbox allow-scripts; default-src 'none'; frame-ancestors 'self'";
    probe.get('/preview-probe', async (_request, reply) => {
      return reply.header('content-security-policy', own).type('text/html').send('<!doctype html>');
    });
    const res = await probe.inject({ method: 'GET', url: '/preview-probe' });
    await probe.close();
    expect(res.headers['content-security-policy']).toBe(own);
    expect(res.headers['x-frame-options']).toBeUndefined();
    // Defense in depth still applies.
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('accepts a browser violation report through the beta wall and answers 204', async () => {
    const res = await app.inject({
      method: 'POST',
      url: CSP_REPORT_PATH,
      headers: { 'content-type': 'application/csp-report' },
      payload: JSON.stringify({
        'csp-report': { 'document-uri': 'https://www.gamedev.pl/', 'blocked-uri': 'https://evil.test/x.js' },
      }),
    });
    expect(res.statusCode).toBe(204);
  });

  it('accepts a Reporting API batch too', async () => {
    const res = await app.inject({
      method: 'POST',
      url: CSP_REPORT_PATH,
      headers: { 'content-type': 'application/reports+json' },
      payload: JSON.stringify([{ type: 'csp-violation', body: { blockedURL: 'https://evil.test/x.js' } }]),
    });
    expect(res.statusCode).toBe(204);
  });

  it('is off for the report-only policy when the operator says so', async () => {
    const probe = await buildApp({ store: new InMemoryStore(), sessionSecret });
    process.env.APP_CSP_REPORT_ONLY = 'off';
    try {
      const off = await buildApp({ store: new InMemoryStore(), sessionSecret });
      off.get('/html-probe', async (_request, reply) => reply.type('text/html').send('<!doctype html>'));
      const res = await off.inject({ method: 'GET', url: '/html-probe' });
      await off.close();
      expect(res.headers['content-security-policy-report-only']).toBeUndefined();
      // Framing is not a matter of opinion: still denied.
      expect(res.headers['content-security-policy']).toBe(FRAME_ANCESTORS_NONE);
    } finally {
      delete process.env.APP_CSP_REPORT_ONLY;
      await probe.close();
    }
  });
});

describe('isPlayPermalinkPath', () => {
  it('accepts catalog play permalinks a parent may iframe', () => {
    expect(isPlayPermalinkPath('/play/unicorn-snap')).toBe(true);
    expect(isPlayPermalinkPath('/play/rainbow-surfer?x=1')).toBe(true);
    expect(isPlayPermalinkPath('/ai/seventh-color/')).toBe(true);
  });
  it('rejects everything else', () => {
    expect(isPlayPermalinkPath('/')).toBe(false);
    expect(isPlayPermalinkPath('/play/')).toBe(false);
    expect(isPlayPermalinkPath('/play/-bad')).toBe(false);
    expect(isPlayPermalinkPath('/admin')).toBe(false);
    expect(isPlayPermalinkPath('/draft/unicorn-snap')).toBe(false);
  });
});

describe('resolveCspReportOnly', () => {
  it('defaults to the built-in policy', () => {
    expect(resolveCspReportOnly({})).toBe(APP_CSP_REPORT_ONLY);
    expect(resolveCspReportOnly({ APP_CSP_REPORT_ONLY: 'true' })).toBe(APP_CSP_REPORT_ONLY);
  });
  it('turns off on false/off', () => {
    expect(resolveCspReportOnly({ APP_CSP_REPORT_ONLY: 'false' })).toBeNull();
    expect(resolveCspReportOnly({ APP_CSP_REPORT_ONLY: 'OFF' })).toBeNull();
  });
  it('takes any other value verbatim as a draft policy', () => {
    expect(resolveCspReportOnly({ APP_CSP_REPORT_ONLY: "default-src 'none'" })).toBe("default-src 'none'");
  });
});

describe('summarizeCspReport', () => {
  it('reduces a legacy report to its useful fields', () => {
    const [summary] = summarizeCspReport(
      JSON.stringify({
        'csp-report': {
          'document-uri': 'https://www.gamedev.pl/',
          'violated-directive': 'script-src',
          'blocked-uri': 'https://evil.test/x.js',
          'line-number': 12,
          'script-sample': 'x'.repeat(5000),
        },
      }),
    );
    expect(summary).toEqual({
      documentURL: 'https://www.gamedev.pl/',
      violatedDirective: 'script-src',
      blockedURL: 'https://evil.test/x.js',
      lineNumber: 12,
    });
  });
  it('never throws on garbage', () => {
    expect(summarizeCspReport('not json')).toEqual([{ unparsed: true }]);
    expect(summarizeCspReport('42')).toEqual([{ unparsed: true }]);
  });
});
