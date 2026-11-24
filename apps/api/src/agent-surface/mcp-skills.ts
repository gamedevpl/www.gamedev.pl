import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

/**
 * Skills over MCP (`io.modelcontextprotocol/skills`): the server ships the gamedevpl
 * skill itself, so a client with no plugin still gets the loop rules, and the text
 * moves with every deploy instead of waiting for a plugin release.
 *
 * The skill is the same file the plugin installs (`skills/gamedevpl/SKILL.md` at the
 * repo root). The image copies it beside this module (`build:assets`); in a checkout it
 * is read from the root. When neither exists the extension is simply not declared.
 */

export const GAMEDEVPL_SKILL_URI = 'skill://gamedevpl/SKILL.md';

// The skill changes only on deploy, which every instance picks up on boot.
export const SKILL_CACHE = { ttlMs: 3_600_000, cacheScope: 'public' as const };

export interface McpSkill {
  uri: string;
  text: string;
  frontmatter: Record<string, string>;
  digest: string;
  size: number;
}

const CANDIDATES = [
  new URL('./skills/gamedevpl/SKILL.md', import.meta.url),
  new URL('../../../../skills/gamedevpl/SKILL.md', import.meta.url),
];

// Flat `key: value` frontmatter, which is all a SKILL.md here carries. Every field is
// kept, as the extension requires.
export function parseSkillFrontmatter(text: string): Record<string, string> | null {
  if (!text.startsWith('---\n')) return null;
  const end = text.indexOf('\n---', 4);
  if (end < 0) return null;
  const fields: Record<string, string> = {};
  for (const line of text.slice(4, end).split('\n')) {
    const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!match) continue;
    let value = match[2]!.trim();
    if (value.length >= 2 && (value[0] === '"' || value[0] === "'") && value.endsWith(value[0]!)) {
      value = value.slice(1, -1);
    }
    fields[match[1]!] = value;
  }
  return fields.name && fields.description ? fields : null;
}

export function skillFromText(uri: string, text: string): McpSkill | null {
  const frontmatter = parseSkillFrontmatter(text);
  if (!frontmatter) return null;
  const bytes = Buffer.from(text, 'utf8');
  return {
    uri,
    text,
    frontmatter,
    digest: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
    size: bytes.length,
  };
}

let loaded: McpSkill[] | null = null;

/** The skills this server ships; empty when the file is not on disk. */
export function serverSkills(): McpSkill[] {
  if (loaded) return loaded;
  for (const candidate of CANDIDATES) {
    try {
      const skill = skillFromText(GAMEDEVPL_SKILL_URI, readFileSync(candidate, 'utf8'));
      if (skill) return (loaded = [skill]);
    } catch {
      // Try the next location.
    }
  }
  return (loaded = []);
}

/** A skills/list entry (or skills/get `skill`): one atomic manifest per skill. */
export function skillEntry(skill: McpSkill) {
  return {
    uri: skill.uri,
    frontmatter: skill.frontmatter,
    resources: [{ uri: skill.uri, digest: skill.digest, size: skill.size }],
  };
}

export function findSkill(uri: string): McpSkill | null {
  return serverSkills().find((skill) => skill.uri === uri) ?? null;
}
