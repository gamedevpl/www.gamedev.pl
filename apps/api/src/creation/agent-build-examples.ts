/**
 * Curated first-party exemplar catalog for BYOCA agents (get_examples).
 *
 * The list is a hand-maintained JSON file in this package — never a live store
 * query — so a creator-originating game cannot appear here by accident. Only
 * these slugs may have their sources exposed via the signed-tarball endpoint.
 */

// Import attribute required at runtime under Node ESM (tsc emit + Node 20).
// Without `with { type: 'json' }` the production image dies on boot with
// ERR_IMPORT_ASSERTION_TYPE_MISSING — CI's Production image job caught that.
import allowlistJson from './agent-build-examples.json' with { type: 'json' };

export interface AgentBuildExample {
  slug: string;
  title: string;
  genre: string;
  modules: string[];
  whyReference: string;
}

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

function parseAllowlist(raw: unknown): AgentBuildExample[] {
  if (!Array.isArray(raw)) throw new Error('agent-build-examples.json must be an array');
  const examples: AgentBuildExample[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') throw new Error('invalid example allowlist entry');
    const row = entry as Record<string, unknown>;
    if (typeof row.slug !== 'string' || !SLUG_PATTERN.test(row.slug)) {
      throw new Error(`invalid example slug: ${String(row.slug)}`);
    }
    if (typeof row.title !== 'string' || !row.title) throw new Error(`example ${row.slug}: title required`);
    if (typeof row.genre !== 'string' || !row.genre) throw new Error(`example ${row.slug}: genre required`);
    if (!Array.isArray(row.modules) || !row.modules.every((m) => typeof m === 'string')) {
      throw new Error(`example ${row.slug}: modules must be a string array`);
    }
    if (typeof row.whyReference !== 'string' || !row.whyReference) {
      throw new Error(`example ${row.slug}: whyReference required`);
    }
    examples.push({
      slug: row.slug,
      title: row.title,
      genre: row.genre,
      modules: row.modules as string[],
      whyReference: row.whyReference,
    });
  }
  return examples;
}

const ALLOWLIST = parseAllowlist(allowlistJson);

/** Full curated list — order is the file's order. */
export function listAgentBuildExamples(): AgentBuildExample[] {
  return ALLOWLIST.map((entry) => ({ ...entry, modules: [...entry.modules] }));
}

/** Allowlisted entry for a slug, or null when the slug is not on the list. */
export function getAgentBuildExample(slug: string): AgentBuildExample | null {
  return ALLOWLIST.find((entry) => entry.slug === slug) ?? null;
}
