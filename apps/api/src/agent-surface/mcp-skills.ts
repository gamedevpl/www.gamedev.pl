import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

// Serves the gamedevpl SKILL.md over MCP (build:assets copies it).

export const GAMEDEVPL_SKILL_URI = 'skill://gamedevpl/SKILL.md';

// The skill changes only on deploy.
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

// Flat `key: value` frontmatter; every field is kept.
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

// Shipped skills; empty when the file is missing.
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

// One atomic skills/list manifest entry.
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
