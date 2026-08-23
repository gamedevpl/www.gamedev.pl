/**
 * The code lane over a *corpus*, so a change to it can be judged on more than an
 * anecdote.
 *
 * `remix-lane-probe.ts` shows one run in detail; this runs many and counts what
 * happened. Same real lane, same real rebuild — the difference is that it varies
 * one thing at a time (`--variant`, `--typecheck`) and writes a result row per
 * case, so two configurations can be compared.
 *
 * It deliberately does not decide whether a game *works*: a build that succeeds
 * says nothing about whether the game still runs, because esbuild transpiles
 * TypeScript without checking it. Pass `--html-dir` and put the documents
 * through `remix-lane-judge.ts`, which opens them.
 *
 *   npx tsx scripts/remix-lane-sweep.ts --corpus cases.json --variant types --typecheck \
 *     --html-dir /tmp/run --out /tmp/results.json
 *   npx tsx scripts/remix-lane-sweep.ts --baseline garden-gather --html-dir /tmp/base
 */

import path from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import {
  DEFAULT_EDIT_CONTEXT,
  VertexCodeLane,
  type CodeLaneEditContext,
  type CodeLaneOutcome,
} from '../src/creation/code-lane.js';
import type { SymbolRegion } from '../src/creation/symbol-map.js';
import { REF, assembleGame, gameKit, github, typeCheck } from './remix-lane-bench.js';

export interface ProbeCase {
  slug: string;
  utterance: string;
  /** `easy` | `medium` | `hard` — recorded, never shown to the model. */
  difficulty?: string;
}

export interface ProbeResult extends ProbeCase {
  variant: string;
  /** refused | no_region | did_not_compile | error | built */
  outcome: string;
  region?: string;
  summary?: string;
  rounds?: number;
  tokens: { input: number; output: number };
  seconds: number;
  detail?: string;
  /** Diagnostics the tsc gate raised, whether or not it was allowed to fail the build. */
  typeErrors?: string[];
  htmlPath?: string;
}

interface RunOptions {
  variant: CodeLaneEditContext;
  typecheck: boolean;
  /** Run tsc for the record but never let it fail a candidate. */
  observeOnly: boolean;
  showMap: boolean;
  showPrompt: boolean;
  showRaw: boolean;
  htmlPath?: string;
  model?: string;
}

async function probe(testCase: ProbeCase, options: RunOptions): Promise<ProbeResult> {
  const startedAt = Date.now();
  const sources = await github.getGameSourceMap(REF, testCase.slug);
  if (!sources) {
    return { ...testCase, variant: label(options), outcome: 'no_sources', tokens: { input: 0, output: 0 }, seconds: 0 };
  }

  let picked: SymbolRegion | null = null;
  const typeErrors: string[] = [];
  const lane = new VertexCodeLane({
    editContext: options.variant,
    ...(options.model ? { model: options.model } : {}),
    observe: {
      regions: (regions) => {
        if (!options.showMap) return;
        console.log(`\n── symbol map (${regions.length} regions) ──`);
        for (const region of regions) {
          console.log(
            `  ${region.file}:${region.name} (${region.endLine - region.startLine + 1}L) ${region.signature}`,
          );
        }
      },
      picked: (decision, region) => {
        picked = region;
        console.log(`\n── pick: ${decision} → ${region ? `${region.file}:${region.name}` : '(none)'} ──`);
      },
      editPrompt: (round, prompt) => {
        console.log(`\n── edit call, round ${round} (${prompt.length} chars) ──`);
        if (options.showPrompt) console.log(prompt);
      },
      replacement: (round, replacement) => {
        if (!options.showPrompt) return;
        console.log(`\n── replacement, round ${round} ──\n${replacement}`);
      },
      raw: (text) => {
        if (!options.showRaw) return;
        console.log(`\n── raw response (${text.length} chars) ──\n${text}\n── end raw ──`);
      },
      built: (round, result) => {
        console.log(`   round ${round}: ${result.ok ? 'BUILDS' : `FAILS — ${result.errors.join(' | ')}`}`);
      },
    },
  });

  const kit = await gameKit();
  // Same two inputs the route supplies, for the same reason: the kit says what
  // exists anywhere, the module list says what exists *here*.
  const manifest = await github.getGameFile(REF, testCase.slug, 'GAME.json');
  const modules: string[] = (() => {
    try {
      const value = (JSON.parse(manifest ?? '{}') as { modules?: unknown }).modules;
      return Array.isArray(value) ? value.filter((name): name is string => typeof name === 'string') : [];
    } catch {
      return [];
    }
  })();
  const outcome: CodeLaneOutcome = await lane.run(
    { slug: testCase.slug, sources, utterance: testCase.utterance, modules, ...(kit ? { kit } : {}) },
    async (candidate) => {
      // Type-check first when asked: it is the cheaper answer and its message is
      // the more useful one to hand a repair round.
      if (options.typecheck) {
        const checked = await typeCheck(testCase.slug, { ...sources, ...candidate });
        if (!checked.ok) {
          typeErrors.push(...checked.errors);
          if (!options.observeOnly) return checked;
        }
      }
      try {
        const html = await assembleGame(testCase.slug, candidate);
        return html ? { ok: true } : { ok: false, errors: ['the game could not be assembled'] };
      } catch (error) {
        return { ok: false, errors: [error instanceof Error ? error.message : String(error)] };
      }
    },
  );

  const result: ProbeResult = {
    ...testCase,
    variant: label(options),
    outcome: outcome.ok ? 'built' : outcome.reason,
    tokens: outcome.tokens,
    seconds: Number(((Date.now() - startedAt) / 1000).toFixed(1)),
    ...(picked ? { region: `${picked!.file}:${picked!.name}` } : {}),
    ...(outcome.summary ? { summary: outcome.summary.en } : {}),
    ...(outcome.ok ? { rounds: outcome.rounds } : { detail: outcome.detail }),
    ...(typeErrors.length ? { typeErrors } : {}),
  };

  if (outcome.ok && options.htmlPath) {
    const html = await assembleGame(testCase.slug, outcome.overrides);
    if (html) {
      await mkdir(path.dirname(options.htmlPath), { recursive: true });
      await writeFile(options.htmlPath, html, 'utf8');
      result.htmlPath = options.htmlPath;
    }
  }
  return result;
}

function label(options: RunOptions): string {
  return `${options.variant}${options.typecheck ? (options.observeOnly ? '+tsc(observed)' : '+tsc') : ''}`;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

async function main() {
  const argv = process.argv.slice(2);
  const flag = (name: string): string | undefined => {
    const index = argv.indexOf(`--${name}`);
    return index === -1 ? undefined : argv[index + 1];
  };
  const has = (name: string) => argv.includes(`--${name}`);
  /** Flags that take no value, so the word after them is positional, not theirs. */
  const BOOLEAN_FLAGS = new Set(['map', 'prompt', 'raw', 'typecheck', 'observe-only', 'baseline']);
  const positional = argv.filter((argument, index) => {
    if (argument.startsWith('--')) return false;
    const previous = argv[index - 1];
    return !(previous?.startsWith('--') && !BOOLEAN_FLAGS.has(previous.slice(2)));
  });

  const options: RunOptions = {
    // Defaults to whatever production defaults to. A bench whose default
    // differed from the serve path would measure a configuration nobody runs.
    variant: (flag('variant') as CodeLaneEditContext) ?? DEFAULT_EDIT_CONTEXT,
    typecheck: has('typecheck'),
    observeOnly: has('observe-only'),
    showMap: has('map'),
    showPrompt: has('prompt'),
    showRaw: has('raw'),
    ...(flag('html') ? { htmlPath: flag('html')! } : {}),
    ...(flag('model') ? { model: flag('model')! } : {}),
  };

  // `--baseline` assembles the game untouched. It calls no model, and it exists
  // so the judge can be calibrated: a game that was already broken must not be
  // counted against the lane, and a judge that never sees an unedited game
  // cannot tell the two apart.
  if (has('baseline')) {
    const slugs = positional.length ? positional : [];
    const dir = flag('html-dir') ?? '.';
    for (const slug of slugs) {
      const html = await assembleGame(slug, {});
      const target = path.join(dir, `baseline-${slug}.html`);
      if (html) {
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, html, 'utf8');
        console.log(`baseline ${slug} → ${target}`);
      } else {
        console.log(`baseline ${slug} → could not assemble`);
      }
    }
    return;
  }

  const corpusPath = flag('corpus');
  const cases: ProbeCase[] = corpusPath
    ? JSON.parse(await readFile(corpusPath, 'utf8'))
    : [{ slug: positional[0], utterance: positional[1] }];

  if (!cases.length || !cases[0].slug || !cases[0].utterance) {
    console.error('usage: remix-lane-probe <slug> "<utterance>" [--map] [--prompt] [--html out.html]');
    console.error(
      '       remix-lane-probe --corpus cases.json [--variant region|types|file] [--typecheck] [--out results.json]',
    );
    process.exit(1);
  }

  const results: ProbeResult[] = [];
  const htmlDir = flag('html-dir');
  for (const [index, testCase] of cases.entries()) {
    console.log(`\n${'='.repeat(70)}\n[${index + 1}/${cases.length}] ${testCase.slug} — "${testCase.utterance}"`);
    const perCase: RunOptions = {
      ...options,
      ...(htmlDir
        ? {
            htmlPath: path.join(
              htmlDir,
              `${String(index + 1).padStart(2, '0')}-${testCase.slug}-${label(options).replace(/[^a-z]/g, '')}.html`,
            ),
          }
        : {}),
    };
    try {
      const result = await probe(testCase, perCase);
      results.push(result);
      console.log(
        `→ ${result.outcome}${result.region ? ` @ ${result.region}` : ''} — ${result.tokens.input}in/${result.tokens.output}out, ${result.seconds}s${result.typeErrors ? `, tsc: ${result.typeErrors.length}` : ''}`,
      );
    } catch (error) {
      console.log(`→ threw: ${error instanceof Error ? error.message : String(error)}`);
      results.push({
        ...testCase,
        variant: label(perCase),
        outcome: 'error',
        tokens: { input: 0, output: 0 },
        seconds: 0,
        detail: String(error),
      });
    }
  }

  const outPath = flag('out');
  if (outPath) {
    await writeFile(outPath, JSON.stringify(results, null, 2), 'utf8');
    console.log(`\nwrote ${results.length} results → ${outPath}`);
  }

  if (cases.length > 1) {
    const tally = new Map<string, number>();
    for (const result of results) tally.set(result.outcome, (tally.get(result.outcome) ?? 0) + 1);
    const input = results.reduce((sum, result) => sum + result.tokens.input, 0);
    const output = results.reduce((sum, result) => sum + result.tokens.output, 0);
    console.log(`\n── ${label(options)} over ${results.length} cases ──`);
    for (const [outcome, count] of [...tally].sort((a, b) => b[1] - a[1])) console.log(`  ${outcome}: ${count}`);
    console.log(`  tokens: ${input} in / ${output} out (${Math.round((input + output) / results.length)} per case)`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
