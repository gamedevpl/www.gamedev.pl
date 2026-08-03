/**
 * The control experiment behind the type-check gate.
 *
 * Injects the exact failure shape that was reported from production — an object
 * literal reading a field that does not exist on the type — and asks three
 * questions in order:
 *
 *   1. Does esbuild accept it?   (it must, or there is no problem to fix)
 *   2. Does the runtime throw?   (it must, or the judge is not measuring anything)
 *   3. Does tsc catch it?        (the proposed gate, and what it costs)
 *
 * Plus the one that decides whether the gate is safe to turn on: does tsc run
 * clean on the *unedited* game? A gate with false positives would reject good
 * edits, which is worse than the failure it prevents.
 *
 *   npm run remix:calibrate -w @gamedevpl/api
 */

import path from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { GAMES_ROOT, REF, assembleGame, github, typeCheck } from './remix-lane-bench.js';

/** The game's own sources, so the check sees the whole game and not one file. */
const gameSources = async () => (await github.getGameSourceMap(REF, SLUG)) ?? {};

const SLUG = 'garden-gather';
const FILE = 'game/model.ts';
/** The half-edit: the field was renamed here and nowhere else. */
const FROM = 'gardens: content.gardens.map(parseGarden),';
const TO = 'gardens: content.levels.map(parseGarden),';

async function main() {
  const outDir = process.argv[2] ?? path.join(GAMES_ROOT, '..', 'lane-calibration');
  const original = await readFile(path.join(GAMES_ROOT, 'games', SLUG, FILE), 'utf8');
  if (!original.includes(FROM)) {
    console.error(`injection point not found in ${SLUG}/${FILE} — the game changed; update FROM/TO.`);
    process.exit(1);
  }
  const broken = original.replace(FROM, TO);
  const overrides = { [FILE]: broken };

  console.log(`injected into ${SLUG}/${FILE}:\n  - ${FROM}\n  + ${TO}\n`);

  let built = false;
  try {
    const html = await assembleGame(SLUG, overrides);
    if (html) {
      await mkdir(outDir, { recursive: true });
      await writeFile(path.join(outDir, `broken-${SLUG}.html`), html, 'utf8');
      built = true;
    }
  } catch (error) {
    console.log(`1. esbuild: REJECTED — ${error instanceof Error ? error.message : String(error)}`);
  }
  if (built) {
    console.log(`1. esbuild: BUILT. The break is now a document, indistinguishable from a good edit.`);
    console.log(`   wrote ${path.join(outDir, `broken-${SLUG}.html`)} — judge it to see it throw.`);
  }

  const brokenStarted = Date.now();
  const brokenCheck = await typeCheck(SLUG, { ...(await gameSources()), ...overrides });
  const brokenSeconds = ((Date.now() - brokenStarted) / 1000).toFixed(1);
  console.log(`\n3. tsc on the break (${brokenSeconds}s): ${brokenCheck.ok ? 'CLEAN — the gate would NOT catch this' : 'CAUGHT'}`);
  if (!brokenCheck.ok) for (const error of brokenCheck.errors) console.log(`     ${error}`);

  const cleanStarted = Date.now();
  const cleanCheck = await typeCheck(SLUG, await gameSources());
  const cleanSeconds = ((Date.now() - cleanStarted) / 1000).toFixed(1);
  console.log(
    `\n4. tsc on the unedited game (${cleanSeconds}s): ${cleanCheck.ok ? 'CLEAN — safe to gate on' : 'DIRTY — gating would reject good edits'}`,
  );
  if (!cleanCheck.ok) for (const error of cleanCheck.errors) console.log(`     ${error}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
