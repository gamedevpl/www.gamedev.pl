import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Every COLLECTION GROUP query must have a matching index provisioned in setup-gcp.sh.
 *
 * This test exists because the same mistake shipped twice in two days, both times through
 * a full review:
 *
 * - `listScorecards` ordered a collection group by `computedAt` with no index, so
 *   GET /api/admin/scorecards returned 9 FAILED_PRECONDITION — and because the four
 *   operator reads share one Promise.all, that blanked the whole /health page.
 * - `deletePlayerFeedbackByUid` filtered a collection group by `uid` with no index, which
 *   would have failed an operator mid-way through a deletion request they had already
 *   accepted.
 *
 * Firestore auto-indexes single fields at COLLECTION scope only, never COLLECTION_GROUP,
 * and the failure is a hard error rather than a slow query. Nothing catches it before
 * production: `InMemoryStore` has no concept of an index, so every test passes either way,
 * and the query reads exactly like the collection-scoped ones that do work.
 *
 * So the check has to be on the source itself. It is a lint over text, not a type — which
 * means it can be defeated by writing the query in a shape the regex does not match. That
 * is why it also asserts it found the call sites it expects: a guard that silently matches
 * nothing is worse than no guard, because it reads as coverage.
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');

const setupScript = readFileSync(resolve(repoRoot, 'infra/setup-gcp.sh'), 'utf8');

/**
 * Every non-test source file, not just store.ts.
 *
 * Firestore access is *conventionally* confined to the store, but nothing enforces that,
 * and a guard that assumes the convention holds is one that stops working the first time
 * somebody breaks it — silently, which is the failure mode this whole file exists to
 * prevent.
 */
function apiSources(): string[] {
  return readdirSync(here)
    .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
    .map((name) => readFileSync(join(here, name), 'utf8'));
}

interface QuerySite {
  group: string;
  fields: string[];
}

/**
 * Finds `collectionGroup('x')` and the fields constrained on the same statement.
 *
 * "Same statement" is everything up to the next `;`, which is what makes chained calls
 * across several lines work. Both `where` and `orderBy` count: each needs the field
 * indexed at COLLECTION_GROUP scope.
 */
function findCollectionGroupQueries(source: string): QuerySite[] {
  const sites: QuerySite[] = [];
  const groupPattern = /\.collectionGroup\(\s*'([^']+)'\s*\)/g;

  for (const match of source.matchAll(groupPattern)) {
    const start = match.index + match[0].length;
    const end = source.indexOf(';', start);
    const statement = source.slice(start, end === -1 ? source.length : end);

    const fields = [...statement.matchAll(/\.(?:where|orderBy)\(\s*'([^']+)'/g)].map((field) => field[1]);
    sites.push({ group: match[1], fields });
  }

  return sites;
}

/** Parses the `CG_INDEXES="group:field:ORDER ..."` list that step 7 iterates over. */
function provisionedIndexes(script: string): Set<string> {
  const declaration = /CG_INDEXES="([^"]*)"/.exec(script);
  if (!declaration) throw new Error('CG_INDEXES not found in infra/setup-gcp.sh — did step 7 get renamed?');

  const provisioned = new Set<string>();
  for (const entry of declaration[1].split(/\s+/).filter(Boolean)) {
    const [group, field] = entry.split(':');
    provisioned.add(`${group}.${field}`);
  }
  return provisioned;
}

describe('COLLECTION_GROUP indexes', () => {
  const sites = apiSources().flatMap((source) => findCollectionGroupQueries(source));

  it('finds the collection-group queries it is meant to be guarding', () => {
    // If a refactor moves these queries or changes how they are written, this fails
    // rather than quietly guarding an empty list.
    const found = sites.map((site) => site.group).sort();

    expect(
      found,
      'The set of collection groups queried by store.ts changed. If you added a query, add the ' +
        'group here and its field to CG_INDEXES in infra/setup-gcp.sh. If this went empty or ' +
        'lost an entry, the regex above stopped matching the code it guards — fix the regex, ' +
        'because a guard that matches nothing still passes and reads as coverage.',
    ).toEqual(['playerFeedback', 'scorecard']);
  });

  it('provisions an index for every field a collection-group query constrains', () => {
    const provisioned = provisionedIndexes(setupScript);

    const missing = sites.flatMap((site) =>
      site.fields.filter((field) => !provisioned.has(`${site.group}.${field}`)).map((field) => `${site.group}.${field}`),
    );

    expect(
      missing,
      missing.length
        ? `No COLLECTION_GROUP index for ${missing.join(', ')}. Firestore indexes single fields at ` +
            'COLLECTION scope only, so this query will fail in production with 9 FAILED_PRECONDITION ' +
            '— not run slowly, fail. Add it to CG_INDEXES in infra/setup-gcp.sh (step 7) as ' +
            '`group:field:ASCENDING` (equality) or `group:field:DESCENDING` (descending orderBy), ' +
            'then re-run the script against the live project.'
        : undefined,
    ).toEqual([]);
  });
});
