import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MCP_INSTALL_LINK_CREDENTIAL_MARKERS } from './agent-surface/mcp-install-links.js';
import { MCP_UNADVERTISED_TOOLS, MCP_VISIBLE_TOOLS } from './agent-surface/mcp-server.js';
import { MCP_UI_APP_ONLY_TOOLS } from './agent-surface/mcp-ui.js';

// Copy in several places drifts — the closed-beta clause already did.
// Every manifest must match the registry and its endpoint.
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');

function readJson(relative: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(repoRoot, relative), 'utf8')) as Record<string, unknown>;
}

// Else a registry that lost its remote passes as undefined === undefined.
function registryEndpoint(registry: Record<string, unknown>): string | undefined {
  const url = (registry.remotes as Array<{ url?: string }> | undefined)?.[0]?.url;
  expect(url).toMatch(/^https:\/\//);
  return url;
}

// Canonical list first, so a prefix added there is enforced here.
const CREDENTIAL_MARKERS = [...MCP_INSTALL_LINK_CREDENTIAL_MARKERS, 'token', 'secret', 'key'].map((marker) =>
  marker.toLowerCase(),
);

describe('.cursor-plugin manifest', () => {
  const manifest = readJson('.cursor-plugin/plugin.json');
  const mcp = readJson('mcp.json');
  const registry = readJson('listings/mcp/official-registry/server.json');

  it('describes the product the same way the registry entry does', () => {
    expect(manifest.description).toBe(registry.description);
  });

  it('advertises the endpoint the registry publishes', () => {
    const servers = mcp.mcpServers as Record<string, { url: string }>;
    expect(servers.gamedevpl.url).toBe(registryEndpoint(registry));
  });

  it('never ships a credential in the install config', () => {
    const serialized = JSON.stringify(mcp).toLowerCase();
    for (const marker of CREDENTIAL_MARKERS) {
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
    version?: string;
    license?: string;
    mcpServers?: Record<string, { url?: string; type?: string }>;
  }

  // Both declarations point at the same endpoint, so neither can be updated alone.
  // Compare whole entries rather than one field, and sort keys so the assertion does not
  // depend on JSON insertion order or on there only ever being one server.
  it('keeps the marketplace entry and the plugin .mcp.json in agreement', () => {
    const inline = entry.mcpServers as Record<string, unknown>;
    const file = pluginMcp.mcpServers as Record<string, unknown>;
    expect(Object.keys(inline).sort()).toEqual(Object.keys(file).sort());
    for (const key of Object.keys(file)) {
      expect(inline[key], `server "${key}" differs between the two declarations`).toEqual(file[key]);
    }
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

  // 1.0.1 declared mcpServers only in the marketplace entry and exposed no tools.
  // "Installs cleanly" and "exposes the server" turned out to be different things.
  it('ships an .mcp.json in the plugin root, which is where the loader looks', () => {
    const servers = pluginMcp.mcpServers as Record<string, { url?: string; type?: string }>;
    expect(servers.gamedevpl.url).toBe(registryEndpoint(registry));
    expect(servers.gamedevpl.type).toBe('http');
    expect(plugin.mcpServers).toBe('./.mcp.json');
  });

  it('advertises the endpoint the registry publishes', () => {
    expect(entry.mcpServers?.gamedevpl?.url).toBe(registryEndpoint(registry));
  });

  it('never ships a credential in either install config', () => {
    for (const [label, config] of [
      ['marketplace.json', entry.mcpServers ?? {}],
      ['.mcp.json', pluginMcp.mcpServers ?? {}],
    ] as const) {
      const serialized = JSON.stringify(config).toLowerCase();
      for (const marker of CREDENTIAL_MARKERS) {
        expect(serialized, `${label} must not carry ${marker}`).not.toContain(marker);
      }
    }
  });

  // Discovery walks the plugin root; `.claude/` holds internal tooling.
  // Rooting the plugin at its own directory is what keeps them apart.
  it('roots the plugin away from the repository root, so discovery cannot reach .claude/', () => {
    expect(entry.source).toBe('./listings/mcp/claude-plugin');
    expect(entry.source).not.toBe('./');
    expect(entry.source).not.toBe('.');
  });

  /**
   * Three version lines coincided at 1.0.1 and an earlier revision of this test asserted
   * they must stay equal — which would have blocked the fix that required bumping one of
   * them. They are independent artifacts:
   *
   *   - the registry `server.json` versions the MCP *server*, and is immutable once
   *     published, so it moves only when the server itself changes;
   *   - `.cursor-plugin/plugin.json` versions the Cursor plugin;
   *   - the Claude plugin versions the Claude plugin, and had to ship 1.0.2 because
   *     Claude uses that number to detect an update, and 1.0.1 was broken.
   *
   * Licence is a genuinely shared fact, so that one still has to agree.
   */
  it('agrees with the Cursor manifest on licence, but versions independently', () => {
    const cursor = readJson('.cursor-plugin/plugin.json');
    expect(plugin.license).toBe(cursor.license);
  });

  // These two declare the *same* artifact, so a bump in one without the other ships a
  // plugin whose advertised version disagrees with itself.
  it('versions the plugin identically in its manifest and its marketplace entry', () => {
    expect(plugin.version).toBe(entry.version);
  });
});

describe('agent-plugins manifest', () => {
  const portable = readJson('listings/mcp/claude-plugin/plugin.json');
  const portableMcp = readJson('listings/mcp/claude-plugin/mcp.json');
  const plugin = readJson('listings/mcp/claude-plugin/.claude-plugin/plugin.json');
  const claudeMcp = readJson('listings/mcp/claude-plugin/.mcp.json');
  const registry = readJson('listings/mcp/official-registry/server.json');

  it('targets the 1.0.0 schemas, which is how the spec version is declared', () => {
    expect(portable.$schema).toBe('https://agent-plugins.org/schemas/1.0.0/plugin.schema.json');
    expect(portableMcp.$schema).toBe('https://agent-plugins.org/schemas/1.0.0/mcp.schema.json');
  });

  it('describes and names the plugin the same way the Claude manifest does', () => {
    expect(portable.name).toBe(plugin.name);
    expect(portable.description).toBe(registry.description);
    expect(portable.license).toBe(plugin.license);
  });

  // Version drift here ships an artifact that differs from what installs.
  it('versions in lockstep with the Claude manifest', () => {
    expect(portable.version).toBe(plugin.version);
  });

  it('advertises the registry endpoint, with the spec transport name', () => {
    const servers = portableMcp.mcpServers as Record<string, { url?: string; type?: string }>;
    const claudeServers = claudeMcp.mcpServers as Record<string, { url?: string }>;
    expect(Object.keys(servers).sort()).toEqual(Object.keys(claudeServers).sort());
    expect(servers.gamedevpl.url).toBe(registryEndpoint(registry));
    expect(servers.gamedevpl.type).toBe('streamable-http');
  });

  it('never ships a credential — the spec allows headers, and we send none', () => {
    const servers = portableMcp.mcpServers as Record<string, Record<string, unknown>>;
    expect(servers.gamedevpl.headers).toBeUndefined();
    const serialized = JSON.stringify(servers).toLowerCase();
    for (const marker of CREDENTIAL_MARKERS) {
      expect(serialized, `mcp.json must not carry ${marker}`).not.toContain(marker);
    }
  });
});

// Both loaders read skills/<name>/SKILL.md, immediate children only.
describe('plugin skills', () => {
  const skillsDir = join(repoRoot, 'listings/mcp/claude-plugin/skills');

  it('ships at least one skill, discoverable one level down', () => {
    const entries = readdirSync(skillsDir, { withFileTypes: true }).filter((entry) => entry.isDirectory());
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(statSync(join(skillsDir, entry.name, 'SKILL.md')).isFile()).toBe(true);
    }
  });

  // A skill that restates the loop drifts from mcp-server.ts.
  it('defers to the server-returned workflow rather than restating it', () => {
    const skill = readFileSync(join(skillsDir, 'gamedevpl/SKILL.md'), 'utf8');
    expect(skill).toContain('When it disagrees');
  });

  // skills.sh reads root, `skills/`, `.claude/skills/` — never inside the plugin.
  // A stale root copy would teach the wrong loop and look fine here.
  it('publishes a byte-identical copy at the root skills/ the installers read', () => {
    const canonical = readFileSync(join(skillsDir, 'gamedevpl/SKILL.md'), 'utf8');
    const rootCopy = readFileSync(join(repoRoot, 'skills/gamedevpl/SKILL.md'), 'utf8');
    expect(rootCopy).toBe(canonical);
  });

  // An unquoted `: ` opens a nested mapping; the skill is then skipped silently.
  // Hand-rolled: no YAML dependency here, and this is the shape that bit us.
  it('gives every skill frontmatter that a YAML parser will accept', () => {
    for (const root of ['.claude/skills', 'skills', 'listings/mcp/claude-plugin/skills']) {
      const dir = join(repoRoot, root);
      for (const entry of readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory())) {
        const label = `${root}/${entry.name}`;
        const text = readFileSync(join(dir, entry.name, 'SKILL.md'), 'utf8');
        expect(text.startsWith('---\n'), `${label} must open with frontmatter`).toBe(true);

        const frontmatter = text.slice(4, text.indexOf('\n---', 4));
        const keys = new Set<string>();
        for (const line of frontmatter.split('\n')) {
          const match = /^([A-Za-z0-9_-]+):[ \t]*(.*)$/.exec(line);
          if (!match) continue;
          const [, key, rawValue] = match;
          keys.add(key);
          const value = rawValue.trim();
          const quoted = /^(['"]).*\1$/.test(value);
          expect(value, `${label}: ${key} contains ": " unquoted, which YAML reads as a nested mapping`).toBe(
            quoted || !value.includes(': ') ? value : `${key} must be quoted`,
          );
        }
        expect(keys.has('name'), `${label} needs a name`).toBe(true);
        expect(keys.has('description'), `${label} needs a description`).toBe(true);
      }
    }
  });
});

describe('the documented tool list', () => {
  const readme = readFileSync(join(repoRoot, 'listings/mcp/README.md'), 'utf8');
  const documented = [...readme.matchAll(/^\|\s*`([a-z_]+)`\s*\|/gm)].map((m) => m[1]);

  // Hand-kept lists go stale.
  it('names exactly the tools a connecting client is offered', () => {
    const advertised = [...MCP_VISIBLE_TOOLS].filter((name) => !MCP_UI_APP_ONLY_TOOLS.has(name));
    expect([...documented].sort()).toEqual([...advertised].sort());
  });

  it('does not document a tool no agent can discover', () => {
    for (const name of MCP_UNADVERTISED_TOOLS) {
      expect(documented, `${name} is unadvertised and must not read as available`).not.toContain(name);
    }
  });

  // Invisible without the UI extension; say so.
  it('says why the app-only tools are missing rather than omitting them silently', () => {
    for (const name of MCP_UI_APP_ONLY_TOOLS) {
      expect(readme).toContain(name);
    }
  });
});
