// Scores knowledge_query chunk retrieval per variant; needs ADC like the API.

import { readFileSync, writeFileSync } from 'node:fs';
import { createQueryKnowledge, scopeToFilter, type KnowledgeScope } from '../src/creation/knowledge-search.js';

interface EvalCase {
  id: string;
  kind: 'kit' | 'docs' | 'example';
  query: string;
  scope?: KnowledgeScope;
  expect: string[];
  // One must appear in the chunk; a path match alone is loose.
  terms?: string[];
}

type BodyEdit = (body: Record<string, unknown>) => void;

const ALL = scopeToFilter(undefined);
const ALL_BUT_EXAMPLES = ALL.replace(',"example"', '');
if (ALL_BUT_EXAMPLES === ALL) throw new Error(`default filter has no "example" tag: ${ALL}`);

// Each variant edits the production :search body before it is sent.
const VARIANTS: Record<string, BodyEdit> = {
  prod: () => {},
  'no-examples': (body) => {
    if (body.filter === ALL) body.filter = ALL_BUT_EXAMPLES;
  },
  'default-threshold': (body) => {
    delete body.relevanceThreshold;
  },
};

const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log('npm run knowledge:eval -w apps/api -- [--variant prod,no-examples] [--cases f] [--out f]');
  console.log('Auth: gcloud auth application-default login. Engine: KNOWLEDGE_SEARCH_* env as in the API.');
  process.exit(0);
}
const value = (name: string) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : undefined);
const variantNames = (value('variant') ?? Object.keys(VARIANTS).join(',')).split(',');
const casesPath = value('cases') ?? new URL('./knowledge-eval-cases.json', import.meta.url);
const cases = JSON.parse(readFileSync(casesPath, 'utf8')) as EvalCase[];

function editingFetch(edit: BodyEdit): typeof fetch {
  return (input, init) => {
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    edit(body);
    return fetch(input, { ...init, body: JSON.stringify(body) });
  };
}

const isGameCode = (path: string) => path.startsWith('games/');
function hits(chunk: { repoPath: string; snippet: string }, c: EvalCase): boolean {
  if (!c.expect.some((prefix) => chunk.repoPath.startsWith(prefix))) return false;
  const text = chunk.snippet.toLowerCase();
  return !c.terms || c.terms.some((term) => text.includes(term.toLowerCase()));
}

interface CaseResult {
  id: string;
  kind: EvalCase['kind'];
  rank: number;
  paths: string[];
  error?: string;
}

async function runVariant(name: string): Promise<CaseResult[]> {
  const edit = VARIANTS[name];
  if (!edit) throw new Error(`unknown variant ${name}; known: ${Object.keys(VARIANTS).join(', ')}`);
  const query = createQueryKnowledge({
    engineId: process.env.KNOWLEDGE_SEARCH_ENGINE_ID?.trim() || 'gamedevpl-knowledge',
    projectId: process.env.KNOWLEDGE_SEARCH_PROJECT_ID?.trim() || undefined,
    location: process.env.KNOWLEDGE_SEARCH_LOCATION?.trim() || undefined,
    quotaProject: process.env.KNOWLEDGE_SEARCH_QUOTA_PROJECT?.trim() || undefined,
    fetchImpl: editingFetch(edit),
  });
  const results: CaseResult[] = [];
  for (const c of cases) {
    const result = await query({ query: c.query, mode: 'chunks', scope: c.scope });
    const paths = result.chunks.map((chunk) => chunk.repoPath);
    const rank = result.chunks.findIndex((chunk) => hits(chunk, c)) + 1;
    const failed = result.warnings.find((w) => w.code !== 'result_truncated');
    results.push({ id: c.id, kind: c.kind, rank, paths, ...(failed ? { error: failed.code } : {}) });
  }
  return results;
}

function summarize(results: CaseResult[]) {
  const rate = (list: CaseResult[]) => (list.length ? list.filter((r) => r.rank > 0).length / list.length : 0);
  const docLike = results.filter((r) => r.kind !== 'example');
  const docPaths = docLike.flatMap((r) => r.paths);
  return {
    hitAt5: rate(results),
    kit: rate(results.filter((r) => r.kind === 'kit')),
    docs: rate(results.filter((r) => r.kind === 'docs')),
    example: rate(results.filter((r) => r.kind === 'example')),
    mrr: results.reduce((sum, r) => sum + (r.rank ? 1 / r.rank : 0), 0) / results.length,
    gameCodeShare: docPaths.length ? docPaths.filter(isGameCode).length / docPaths.length : 0,
    errors: results.filter((r) => r.error).length,
  };
}

const pct = (n: number) => `${Math.round(n * 100)}%`;
const report: Record<string, { summary: ReturnType<typeof summarize>; results: CaseResult[] }> = {};
for (const name of variantNames) {
  const results = await runVariant(name);
  report[name] = { summary: summarize(results), results };
}

console.log(['case', ...variantNames].join('\t'));
for (const [i, c] of cases.entries()) {
  const cells = variantNames.map((name) => {
    const r = report[name]!.results[i]!;
    return r.error ? `ERR ${r.error}` : r.rank ? `#${r.rank}` : `miss (${r.paths.length})`;
  });
  console.log([c.id, ...cells].join('\t'));
}
console.log();
for (const name of variantNames) {
  const s = report[name]!.summary;
  console.log(
    `${name}: hit@5 ${pct(s.hitAt5)} (kit ${pct(s.kit)}, docs ${pct(s.docs)}, example ${pct(s.example)}), ` +
      `MRR ${s.mrr.toFixed(2)}, game code in kit/docs results ${pct(s.gameCodeShare)}, errors ${s.errors}`,
  );
}
const out = value('out');
if (out) writeFileSync(out, JSON.stringify(report, null, 2));
