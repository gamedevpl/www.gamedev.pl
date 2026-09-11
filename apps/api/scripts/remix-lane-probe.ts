/**
 * Run the remix code lane on your machine, and show its work.
 *
 * The lane is three moving parts — a symbol map, two model calls, and a
 * server-side rebuild — and until now the only way to watch them was to remix a
 * real game in production and read the wreckage afterwards. Every one of them
 * runs locally against a games checkout, so this makes an edit reproducible,
 * free to repeat, and inspectable at each step.
 *
 * It is deliberately the *real* lane: the real symbol map, the real Vertex
 * calls, the real esbuild rebuild through the real assembler. A harness that
 * stubs the interesting part would only prove the harness works.
 *
 *   npm run remix:probe -w @gamedevpl/api -- garden-gather "zamiast gwiazdek kolorowe kulki"
 *   npm run remix:probe -w @gamedevpl/api -- garden-gather "make it faster" --html /tmp/out.html
 *
 * Needs application-default credentials for the model calls:
 *   gcloud auth application-default login
 *
 * Reads games from ../../www.gamedev.pl-games by default; override with
 * GAMES_DIR. No network to GitHub, no Firestore, no spend ledger — this is a
 * bench, not a route.
 */

import { writeFileSync } from 'node:fs';
import { assembleGameHtml } from '../src/platform/assemble.js';
import { VertexCodeLane } from '../src/creation/code-lane.js';
import { createLocalGamesClient } from '../src/catalog/local-games-repo.js';
import { buildSymbolMap, renderSymbolMap, sliceRegion } from '../src/creation/symbol-map.js';

const [slug, utterance, ...rest] = process.argv.slice(2);
if (!slug || !utterance) {
  console.error('usage: remix:probe <slug> "<what to change>" [--html <path>] [--map]');
  process.exit(1);
}
const htmlOut = rest.includes('--html') ? rest[rest.indexOf('--html') + 1] : null;
const showMap = rest.includes('--map');

const rootDir = process.env.GAMES_DIR ?? new URL('../../../../www.gamedev.pl-games', import.meta.url).pathname;
const client = createLocalGamesClient({ rootDir });

const rule = (title: string) => console.log(`\n${'─'.repeat(72)}\n${title}\n${'─'.repeat(72)}`);

const sources = await client.getGameSourceMap('main', slug);
if (!sources) {
  console.error(`no sources for "${slug}" under ${rootDir} — is the slug right?`);
  process.exit(1);
}

rule(`SOURCES · ${slug}`);
for (const [path, text] of Object.entries(sources)) {
  console.log(`  ${path.padEnd(34)} ${String(text.split('\n').length).padStart(4)} lines`);
}

const regions = buildSymbolMap(sources);
rule(`SYMBOL MAP · ${regions.length} regions — this, and only this, is what call 1 sees`);
console.log(showMap ? renderSymbolMap(regions) : `  (pass --map to print it)`);

/** The same check the route runs: does the whole document assemble. */
let builds = 0;
const build = async (overrides: Record<string, string>) => {
  builds += 1;
  const label = Object.keys(overrides).join(', ');
  try {
    const assembled = await client.getGameSources('main', slug, overrides);
    if (!assembled) return { ok: false as const, errors: ['the game could not be assembled'] };
    assembleGameHtml(
      { title: slug, description: '', html: assembled.indexHtml, js: assembled.gameJs, css: assembled.styleCss },
      { restrictNetwork: true },
    );
    console.log(`  build #${builds} (${label}): ok`);
    return { ok: true as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`  build #${builds} (${label}): FAILED — ${message.split('\n')[0]}`);
    return { ok: false as const, errors: [message] };
  }
};

rule(`RUN · "${utterance}"`);
const startedAt = Date.now();
const outcome = await new VertexCodeLane().run({ slug, sources, utterance }, build);
const elapsed = Date.now() - startedAt;

rule('OUTCOME');
console.log(`  ${outcome.ok ? 'ok' : `refused/failed — ${outcome.reason}`}`);
console.log(`  ${elapsed}ms · ${builds} build(s) · tokens in ${outcome.tokens.input} out ${outcome.tokens.output}`);
if ('detail' in outcome && outcome.detail) console.log(`  detail: ${outcome.detail}`);
if (outcome.summary) console.log(`  summary: ${outcome.summary.en}`);

if (!outcome.ok) process.exit(0);

console.log(`  region: ${outcome.region.file} → ${outcome.region.name}  (rounds: ${outcome.rounds})`);

const region = buildSymbolMap(sources).find(
  (candidate) => candidate.file === outcome.region.file && candidate.name === outcome.region.name,
);
if (region) {
  const before = sliceRegion(sources[region.file], region);
  const after = sliceRegion(outcome.overrides[region.file], {
    ...region,
    // The replacement rarely has the same line count, so re-map the region onto
    // the new file before slicing it, or the "after" is a window on the wrong lines.
    ...(buildSymbolMap(outcome.overrides).find((r) => r.file === region.file && r.name === region.name) ?? region),
  });
  rule('BEFORE — what call 2 was given');
  console.log(before);
  rule('AFTER — what it wrote back');
  console.log(after);
}

if (htmlOut) {
  const assembled = await client.getGameSources('main', slug, outcome.overrides);
  if (assembled) {
    writeFileSync(
      htmlOut,
      assembleGameHtml(
        { title: slug, description: '', html: assembled.indexHtml, js: assembled.gameJs, css: assembled.styleCss },
        { restrictNetwork: true },
      ),
    );
    rule('PLAYABLE');
    console.log(`  ${htmlOut} — open it in a browser to see whether it actually runs.`);
    console.log('  Assembling is not running: this is the step the lane cannot check for you.');
  }
}
