import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { OAUTH_PROTECTED_RESOURCE_PATH } from './mcp-oauth-metadata.js';
import {
  buildMcpServerJsonDocument,
  MCP_SERVER_DESCRIPTOR_VERSION,
  MCP_SERVER_JSON_PATH,
  MCP_SERVER_REGISTRY_NAME,
} from './mcp-server-discovery.js';
import { MCP_ENDPOINT_PATH } from './self-build-connect.js';
import { InMemoryStore } from '../store.js';

describe('buildMcpServerJsonDocument (BY-18c)', () => {
  const envKeys = ['CANONICAL_HOST', 'APP_BASE_URL', 'MCP_AUTHORIZATION_SERVERS'] as const;

  afterEach(() => {
    for (const key of envKeys) delete process.env[key];
  });

  it('matches the registry remote-server shape and points at PRM for auth', () => {
    process.env.CANONICAL_HOST = 'www.gamedev.pl';
    process.env.MCP_AUTHORIZATION_SERVERS = 'https://www.gamedev.pl';
    const doc = buildMcpServerJsonDocument();

    expect(doc.$schema).toBe('https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json');
    expect(doc.name).toBe(MCP_SERVER_REGISTRY_NAME);
    expect(doc.version).toBe(MCP_SERVER_DESCRIPTOR_VERSION);
    expect(doc.remotes).toEqual([
      {
        type: 'streamable-http',
        url: `https://www.gamedev.pl${MCP_ENDPOINT_PATH}`,
      },
    ]);
    // Auth facts stay in PRM — this document only references that URL.
    expect(doc).not.toHaveProperty('authorization_servers');
    expect(doc._meta).toEqual({
      'pl.gamedev/auth': {
        oauth_protected_resource: `https://www.gamedev.pl${OAUTH_PROTECTED_RESOURCE_PATH}`,
      },
    });
    expect(typeof doc.description).toBe('string');
    expect((doc.description as string).length).toBeLessThanOrEqual(100);
  });

  // Owner decision (2026-08-06): one description regardless of PRIVATE_BETA, matching what
  // is published to the official registry. The beta gate is signalled by websiteUrl (the
  // homepage) instead of by the description.
  it('describes the server the same way whether or not the closed beta is on', () => {
    process.env.CANONICAL_HOST = 'www.gamedev.pl';

    process.env.PRIVATE_BETA = 'true';
    const beta = buildMcpServerJsonDocument().description as string;
    process.env.PRIVATE_BETA = 'false';
    const open = buildMcpServerJsonDocument().description as string;

    expect(beta).toBe(open);
    expect(beta).not.toMatch(/beta|waitlist/i);
    expect(beta.length).toBeLessThanOrEqual(100);
  });

  // The published registry entry and this document describe the same server, so they must
  // not drift. Registry versions are immutable — a change here is a bump in both files.
  it('matches the server.json published to the official registry', async () => {
    process.env.CANONICAL_HOST = 'www.gamedev.pl';
    const { readFile } = await import('node:fs/promises');
    const published = JSON.parse(
      await readFile(new URL('../../../../listings/mcp/official-registry/server.json', import.meta.url), 'utf8'),
    ) as Record<string, unknown>;
    const doc = buildMcpServerJsonDocument();

    expect(doc.version).toBe(published.version);
    expect(doc.description).toBe(published.description);
    expect(doc.websiteUrl).toBe(published.websiteUrl);
    expect(doc.name).toBe(published.name);
  });
});

describe(`GET ${MCP_SERVER_JSON_PATH} (BY-18c)`, () => {
  let app: FastifyInstance | undefined;

  afterEach(async () => {
    delete process.env.CANONICAL_HOST;
    delete process.env.APP_BASE_URL;
    delete process.env.MCP_AUTHORIZATION_SERVERS;
    delete process.env.PRIVATE_BETA;
    if (app) await app.close();
    app = undefined;
  });

  it('serves the metadata document unauthenticated with cache headers', async () => {
    process.env.CANONICAL_HOST = 'www.gamedev.pl';
    app = await buildApp({ store: new InMemoryStore(), sessionSecret: 'dev-session-secret-change-me' });
    const res = await app.inject({ method: 'GET', url: MCP_SERVER_JSON_PATH });
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('public, max-age=3600');
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.json()).toEqual(buildMcpServerJsonDocument());
  });

  it('ignores a spoofed Host header when building absolute URLs', async () => {
    process.env.CANONICAL_HOST = 'www.gamedev.pl';
    app = await buildApp({ store: new InMemoryStore(), sessionSecret: 'dev-session-secret-change-me' });
    const res = await app.inject({
      method: 'GET',
      url: MCP_SERVER_JSON_PATH,
      headers: { host: 'evil.test' },
    });
    const body = res.json() as {
      remotes: Array<{ url: string }>;
      websiteUrl: string;
      _meta: { 'pl.gamedev/auth': { oauth_protected_resource: string } };
    };
    expect(body.remotes[0]?.url).toBe(`https://www.gamedev.pl${MCP_ENDPOINT_PATH}`);
    expect(body.websiteUrl).toBe('https://www.gamedev.pl');
    expect(body._meta['pl.gamedev/auth'].oauth_protected_resource).toBe(
      `https://www.gamedev.pl${OAUTH_PROTECTED_RESOURCE_PATH}`,
    );
    expect(JSON.stringify(body)).not.toContain('evil.test');
  });

  // Well-known paths sit outside `/api/`, so the private-beta wall never sees them —
  // this asserts the document stays public under beta, not that an exemption list admits it.
  it('serves the discovery document without a site session when private beta is on', async () => {
    process.env.CANONICAL_HOST = 'www.gamedev.pl';
    process.env.PRIVATE_BETA = 'true';
    app = await buildApp({ store: new InMemoryStore(), sessionSecret: 'dev-session-secret-change-me' });
    const res = await app.inject({ method: 'GET', url: MCP_SERVER_JSON_PATH });
    expect(res.statusCode).toBe(200);
    expect(res.json().name).toBe(MCP_SERVER_REGISTRY_NAME);
  });
});
