import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Plugin manifests are extra places our listing copy lives, alongside the live discovery
 * document, the registry entry and the listing drafts. Copy that exists in several places
 * drifts — this repo has already watched the closed-beta clause get added to one listing
 * after being dropped from another. These assertions are the cheap guard: every manifest
 * must agree with the registry source of truth, and must point at the same endpoint the
 * app actually serves.
 */
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');

function readJson(relative: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(repoRoot, relative), 'utf8')) as Record<string, unknown>;
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

describe('.claude-plugin marketplace', () => {
  const marketplace = readJson('.claude-plugin/marketplace.json');
  const plugin = readJson('listings/mcp/claude-plugin/.claude-plugin/plugin.json');
  const registry = readJson('listings/mcp/official-registry/server.json');

  interface MarketplacePlugin {
    name: string;
    source: string;
    description: string;
    license?: string;
    mcpServers?: Record<string, { url?: string; type?: string }>;
  }

  // Both declarations point at the same endpoint, so neither can be updated alone.
  it('keeps the marketplace entry and the plugin .mcp.json in agreement', () => {
    const inline = entry.mcpServers as Record<string, { url?: string }>;
    const file = pluginMcp.mcpServers as Record<string, { url?: string }>;
    expect(Object.keys(inline)).toEqual(Object.keys(file));
    expect(inline.gamedevpl.url).toBe(file.gamedevpl.url);
  });

  const entries = marketplace.plugins as MarketplacePlugin[];
  const entry = entries[0];
  const pluginMcp = readJson('listings/mcp/claude-plugin/.mcp.json');

  it('lists exactly the one plugin we intend to publish', () => {
    expect(entries).toHaveLength(1);
    expect(entry.name).toBe(plugin.name);
  });

  it('describes the product the same way the registry entry does', () => {
    expect(entry.description).toBe(registry.description);
    expect(plugin.description).toBe(registry.description);
  });

  /**
   * The first cut declared mcpServers only in the marketplace entry, and the plugin
   * installed with no tools: the documented locations are `.mcp.json` in the plugin root
   * or inline in the plugin's own manifest, and the plugin directory had neither. Assert
   * the file exists and is wired, because "installs cleanly" and "actually exposes the
   * server" turned out to be different things.
   */
  it('ships an .mcp.json in the plugin root, which is where the loader looks', () => {
    const servers = pluginMcp.mcpServers as Record<string, { url?: string; type?: string }>;
    const remotes = registry.remotes as Array<{ url: string }>;
    expect(servers.gamedevpl.url).toBe(remotes[0]?.url);
    expect(servers.gamedevpl.type).toBe('http');
    expect(plugin.mcpServers).toBe('./.mcp.json');
  });

  it('advertises the endpoint the registry publishes', () => {
    const remotes = registry.remotes as Array<{ url: string }>;
    expect(entry.mcpServers?.gamedevpl?.url).toBe(remotes[0]?.url);
  });

  it('never ships a credential in either install config', () => {
    for (const [label, config] of [
      ['marketplace.json', entry.mcpServers ?? {}],
      ['.mcp.json', pluginMcp.mcpServers ?? {}],
    ] as const) {
      const serialized = JSON.stringify(config).toLowerCase();
      for (const marker of ['authorization', 'bearer', 'token', 'apikey', 'api_key', 'secret', 'key']) {
        expect(serialized, `${label} must not carry ${marker}`).not.toContain(marker);
      }
    }
  });

  /**
   * Component discovery walks the plugin root, and this repository's `.claude/` holds
   * internal tooling that must never ship inside a public plugin. Rooting the plugin at
   * its own directory is what prevents that, so the pin is the point of this assertion —
   * not the string itself.
   */
  it('roots the plugin away from the repository root, so discovery cannot reach .claude/', () => {
    expect(entry.source).toBe('./listings/mcp/claude-plugin');
    expect(entry.source).not.toBe('./');
    expect(entry.source).not.toBe('.');
  });

  it('agrees with the Cursor manifest on licence and version', () => {
    const cursor = readJson('.cursor-plugin/plugin.json');
    expect(plugin.license).toBe(cursor.license);
    expect(plugin.version).toBe(cursor.version);
  });
});
