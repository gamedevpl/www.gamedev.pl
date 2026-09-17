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
function apiSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return apiSourceFiles(path);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [path] : [];
  });
}

function apiSources(): string[] {
  return apiSourceFiles(here).map((path) => readFileSync(path, 'utf8'));
}

type IndexOrder = 'ASCENDING' | 'DESCENDING';

interface Constraint {
  group: string;
  field: string;
  order: IndexOrder;
}

/** `scorecard.computedAt:DESCENDING` — the identity an index either has or does not. */
function key(constraint: Pick<Constraint, 'group' | 'field' | 'order'>): string {
  return `${constraint.group}.${constraint.field}:${constraint.order}`;
}

function provisionedIndexes(script: string): Set<string> {
  const declaration = /CG_INDEXES="([^"]*)"/.exec(script);
  if (!declaration) throw new Error('CG_INDEXES not found in infra/setup-gcp.sh — did step 7 get renamed?');

  const provisioned = new Set<string>();
  for (const entry of declaration[1].split(/\s+/).filter(Boolean)) {
    const [group, field, order] = entry.split(':');
    // A malformed entry would otherwise become an index nobody notices is absent — the
    // shell loop would PATCH a nonsense order and this check would compare against
    // `undefined`, so both halves would agree the query is covered when it is not.
    if (!group || !field || (order !== 'ASCENDING' && order !== 'DESCENDING')) {
      throw new Error(`Malformed CG_INDEXES entry "${entry}" — expected group:field:ASCENDING|DESCENDING.`);
    }
    provisioned.add(key({ group, field, order }));
  }
  return provisioned;
}

interface CgStatement {
  group: string;
  constraints: Constraint[];
}

function uniqueConstraints(constraints: Constraint[]): Constraint[] {
  const seen = new Set<string>();
  const unique: Constraint[] = [];
  for (const constraint of constraints) {
    const identity = key(constraint);
    if (seen.has(identity)) continue;
    seen.add(identity);
    unique.push(constraint);
  }
  return unique;
}

function findCollectionGroupStatements(source: string): CgStatement[] {
  const statements: CgStatement[] = [];
  const groupPattern = /\.collectionGroup\(\s*'([^']+)'\s*\)/g;

  for (const match of source.matchAll(groupPattern)) {
    const start = match.index + match[0].length;
    const end = source.indexOf(';', start);
    const statement = source.slice(start, end === -1 ? source.length : end);
    const constraints: Constraint[] = [];
    const constraintPattern = /\.(where|orderBy)\(\s*'([^']+)'\s*(?:,\s*'([^']*)')?/g;
    for (const [, kind, field, second] of statement.matchAll(constraintPattern)) {
      const order: IndexOrder = kind === 'orderBy' && second === 'desc' ? 'DESCENDING' : 'ASCENDING';
      constraints.push({ group: match[1], field, order });
    }
    if (constraints.length > 0) statements.push({ group: match[1], constraints: uniqueConstraints(constraints) });
  }

  return statements;
}

function compositeKey(statement: CgStatement): string {
  return `${statement.group}:${statement.constraints.map((constraint) => `${constraint.field}:${constraint.order}`).join('+')}`;
}

function provisionedComposites(script: string): Set<string> {
  const declaration = /CG_COMPOSITE_INDEXES="([^"]*)"/.exec(script);
  if (!declaration) {
    throw new Error('CG_COMPOSITE_INDEXES not found in infra/setup-gcp.sh — a multi-field collection-group query needs it.');
  }
  return new Set(declaration[1].split(/\s+/).filter(Boolean));
}

describe('COLLECTION_GROUP indexes', () => {
  const statements = apiSources().flatMap((source) => findCollectionGroupStatements(source));
  const singleField = statements.filter((statement) => statement.constraints.length === 1);
  const composite = statements.filter((statement) => statement.constraints.length > 1);

  it('finds the collection-group queries it is meant to be guarding', () => {
    // If a refactor moves these queries or changes how they are written, this fails
    // rather than quietly guarding an empty list. Deduplicated: this asserts *which*
    // groups are queried, so a second query against a group already covered is not a
    // change worth failing over.
    const found = [...new Set(statements.map((statement) => statement.group))].sort();

    expect(
      found,
      'The set of collection groups queried by apps/api/src changed. If you added a query, add ' +
        'the group here and its field to CG_INDEXES (single-field) or CG_COMPOSITE_INDEXES ' +
        '(two or more fields on one statement) in infra/setup-gcp.sh. If this went empty or ' +
        'lost an entry, the regex above stopped matching the code it guards — fix the regex, ' +
        'because a guard that matches nothing still passes and reads as coverage.',
    ).toEqual(['notifications', 'playerFeedback', 'scorecard', 'worldEntries']);
  });

  it('provisions a single-field index for every one-constraint collection-group query', () => {
    const provisioned = provisionedIndexes(setupScript);
    const missing = [
      ...new Set(
        singleField
          .flatMap((statement) => statement.constraints)
          .filter((constraint) => !provisioned.has(key(constraint)))
          .map(key),
      ),
    ];

    expect(
      missing,
      missing.length
        ? `No COLLECTION_GROUP index for ${missing.join(', ')}. Firestore indexes single fields at ` +
            'COLLECTION scope only, so this query will fail in production with 9 FAILED_PRECONDITION ' +
            '— not run slowly, fail. Add each to CG_INDEXES in infra/setup-gcp.sh (step 7) in exactly ' +
            'the `group:field:ORDER` form listed above, then re-run the script against the live ' +
            'project. If an entry for that field already exists, the direction is wrong rather than ' +
            'the index missing: step 7 writes one COLLECTION_GROUP entry per field, and the opposite ' +
            'direction does not satisfy the query.'
        : undefined,
    ).toEqual([]);
  });

  it('provisions a composite index for every multi-field collection-group query', () => {
    expect(
      composite.map(compositeKey).sort(),
      'A collection-group statement with two or more fields needs a composite index. ' +
        'Single-field CG_INDEXES entries cannot satisfy it. Add the fingerprint to ' +
        'CG_COMPOSITE_INDEXES in infra/setup-gcp.sh.',
    ).toEqual(['notifications:emailedAt:ASCENDING+createdAt:ASCENDING']);

    const provisioned = provisionedComposites(setupScript);
    const missing = composite.map(compositeKey).filter((fingerprint) => !provisioned.has(fingerprint));
    expect(
      missing,
      missing.length
        ? `No COLLECTION_GROUP composite for ${missing.join(', ')}. Add it to CG_COMPOSITE_INDEXES ` +
            'as group:field:ORDER+field:ORDER, then re-run infra/setup-gcp.sh against the live project.'
        : undefined,
    ).toEqual([]);
  });
});
