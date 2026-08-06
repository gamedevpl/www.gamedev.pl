import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The Cursor plugin manifest is a fourth place our listing copy lives, after the live
 * discovery document, the registry entry and the listing drafts. Copy that exists in four
 * places drifts — this repo has already watched the closed-beta clause get added to one
 * listing after being dropped from another. These assertions are the cheap guard: the
 * manifest must agree with the registry source of truth, and must point at the same
 * endpoint the app actually serves.
 */
const repoRoot = path.resolve(import.meta.dirname, '../../..');

function readJson(relative: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path.join(repoRoot, relative), 'utf8')) as Record<string, unknown>;
}

describe('.cursor-plugin manifest', () => {
  const manifest = readJson('.cursor-plugin/plugin.json');
  const mcp = readJson('mcp.json');
  const registry = readJson('listings/mcp/official-registry/server.json');

  it('describes the product the same way the registry entry does', () => {
    expect(manifest.description).toBe(registry.description);
  });

  it('advertises the endpoint the registry publishes', () => {
    const remotes = registry.remotes as Array<{ url: string }>;
    const servers = mcp.mcpServers as Record<string, { url: string }>;
    expect(servers.gamedevpl.url).toBe(remotes[0]?.url);
  });

  it('never ships a credential in the install config', () => {
    const serialized = JSON.stringify(mcp).toLowerCase();
    for (const marker of ['authorization', 'bearer', 'token', 'apikey', 'api_key', 'secret', 'key']) {
      expect(serialized, `mcp.json must not carry ${marker}`).not.toContain(marker);
    }
  });

  it('uses a lowercase kebab-case plugin name, as the marketplace requires', () => {
    expect(manifest.name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });
});
