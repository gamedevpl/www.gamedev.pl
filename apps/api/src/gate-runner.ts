// The gate: what stands between an agent's upload and a game reaching players.
//
// Delivery by upload is only safe because of this. An uploaded candidate is unverified by
// definition — it arrives from an agent working on creator-authored text — so nothing may
// publish until our own run of the games repo's full check has passed against it.
//
// Two properties make the verdict mean something:
//
//   1. The engine is **ours**, pinned. The candidate's own sources are materialized into a
//      clean checkout of the games repo at a known ref. Whatever the agent did to its local
//      GameKit is irrelevant: it was never uploaded, and a game that only passes against a
//      modified engine fails here. That is the difference between "the agent says it works"
//      and "it works".
//   2. The artifacts that ship are **produced here**, not accepted. The playable bundle and
//      the capture media are outputs of this run, so serve-time policy — the restrictive
//      CSP, the AI Act provenance marking, the credential scan, the byte budget — is applied
//      by the side that owns it, exactly as `games-snapshot.md` argues it must be.
//
// This never publishes. It records a verdict; a human still approves. Publishing on green
// would quietly delete the moderation boundary that human review exists to be.

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { GameProject } from '@gamedevpl/game-generator';
import { assembleGameHtml } from './assemble.js';
import type { GamesStore, VersionManifest } from './games-store.js';
import { createLocalGamesClient } from './local-games-repo.js';

export interface GateOutcome {
  green: boolean;
  /** Human-readable summary, recorded on the manifest and shown to the operator. */
  report: string;
  /** What the run produced, when it got far enough to produce anything. */
  artifacts: string[];
  /** How long the check took — the number that tells us if this is affordable. */
  durationMs: number;
}

export interface GateRunnerDeps {
  store: GamesStore;
  /**
   * Materializes the games repo harness at `engineRef` into a working directory and
   * returns its path. Injected so the runner can be tested without a network or a clone.
   */
  prepareHarness(engineRef: string): Promise<string>;
  /** Runs a command in the harness. Returns combined output and the exit code. */
  run(command: string, args: string[], cwd: string): Promise<{ code: number; output: string }>;
  now?: () => number;
  /** Where to look for artifacts the check produced, relative to the harness root. */
  artifactRoots?: { media: (slug: string) => string };
  /**
   * Builds the document that will actually be served, from the checked harness.
   * Injected so the runner can be tested without esbuild or a games-repo tree.
   */
  assembleBundle?: (harness: string, slug: string) => Promise<string | null>;
}

const DEFAULT_ARTIFACT_ROOTS = {
  media: (slug: string) => path.join('games', slug, 'media'),
};

/**
 * Assembles the served document from the harness the check just passed against.
 *
 * Deliberately *not* the games repo's own `dist/` build output, which is what this used
 * to store. That output is the repo's idea of a playable page; it is not ours, and the
 * difference is the whole of serve-time policy — the restrictive CSP that stops a game
 * calling home, the AI Act art. 50(2) provenance marking, the credential scan, the byte
 * budget. All four live in `assembleGameHtml`, none of them are in `tools/build.ts`, and
 * shipping the repo's build meant shipping a document with none of them.
 *
 * Assembling here rather than at serve time is what keeps one definition of "what a
 * served game is" across the three things that need one: the creator's draft preview,
 * the published game, and the snapshot bake. It also belongs here for the reason the
 * gate itself does — this repo owns the policy, and the harness is already checked out
 * with the GameKit modules the assembler has to resolve.
 */
async function assembleFromHarness(harness: string, slug: string): Promise<string | null> {
  const client = createLocalGamesClient({ rootDir: harness });
  const sources = await client.getGameSources('main', slug);
  if (!sources) return null;
  const project: GameProject = {
    title: sources.title ?? slug,
    description: '',
    html: sources.indexHtml,
    js: sources.gameJs,
    css: sources.styleCss,
  };
  // Matches the bake and the play route exactly: a game is self-contained by repo
  // policy, so it is locked to its own inline assets.
  return assembleGameHtml(project, { restrictNetwork: true });
}

/**
 * Files the capture harness produces that are worth keeping.
 *
 * `.json` is here for the capture's own `metadata.json`, which describes what each
 * screenshot shows. The behavioural golden is *not* collected here: `TRACE.json` lives
 * at the game root, arrives as part of the delivered sources, and is an input to this
 * run rather than an output of it — which is the whole reason the trace stage can
 * compare against it.
 */
const MEDIA_EXTENSIONS = ['.png', '.mp4', '.json'];

/**
 * Runs the full check for one candidate version.
 *
 * Deliberately sequential and deliberately fail-fast: `check:game` is itself a chain
 * (typecheck → smoke → build → trace → capture → validate) and the first failure is the
 * one worth reporting. Telling an agent about six failures when five are consequences of
 * the first is how a fix round gets spent on the wrong thing.
 */
export async function runGate(slug: string, version: string, deps: GateRunnerDeps): Promise<GateOutcome> {
  const now = deps.now ?? Date.now;
  const roots = deps.artifactRoots ?? DEFAULT_ARTIFACT_ROOTS;
  const startedAt = now();

  const manifest = await deps.store.getManifest(slug, version);
  if (!manifest) {
    return { green: false, report: `no such version: ${slug}@${version}`, artifacts: [], durationMs: 0 };
  }

  // Ideally every version pins the engine *commit* it was built against, so a green
  // verdict stays reproducible after the engine moves on. Deliveries do not record one
  // yet — dispatch targets `main`, a moving branch, and pinning would mean resolving it
  // to a sha at dispatch and carrying that through to the upload. Until that exists this
  // falls back to the default branch, which means a re-run of an old version is checked
  // against a newer engine than it was written for. That is a real limitation, not a
  // detail: it is why `engineRef` is on the manifest at all, and closing it is the next
  // change to this file.
  const engineRef = manifest.engineRef ?? 'main';
  const harness = await deps.prepareHarness(engineRef);
  const gameDir = path.join(harness, 'games', slug);

  try {
    await materializeCandidate(deps.store, manifest, gameDir);

    // Deliberately without `--accept`. That flag re-records the behavioural golden
    // instead of checking against it, which would make the trace stage unconditionally
    // pass and quietly retire the one check that can catch a game behaving differently
    // here than it did for the agent. The candidate ships its own `TRACE.json`, and the
    // gate replays it against *our* engine: a golden recorded against a locally
    // modified GameKit fails here, which is precisely the thing worth catching.
    const check = await deps.run('npm', ['run', 'check:game', '--', slug], harness);
    if (check.code !== 0) {
      return {
        green: false,
        // The tail, not the head: the chain fails at the bottom and the last lines are
        // the ones naming the check that stopped it.
        report: tail(check.output, 4000),
        artifacts: [],
        durationMs: now() - startedAt,
      };
    }

    let artifacts: string[];
    try {
      artifacts = await collectArtifacts(deps, slug, version, harness, roots);
    } catch (error) {
      // A game the repo's own check accepts can still be one we refuse to serve: the
      // credential scan and the byte budget live in the assembler, not in `check:game`.
      // That is a red verdict with a reason the agent can act on, not a crash — a run
      // that dies here would leave the version with no verdict at all, which reads as a
      // gate that never ran rather than one that said no.
      return {
        green: false,
        report: error instanceof Error ? error.message : String(error),
        artifacts: [],
        durationMs: now() - startedAt,
      };
    }

    return {
      green: true,
      report: `check:game passed against engine ${engineRef}; ${artifacts.length} artifacts stored`,
      artifacts,
      durationMs: now() - startedAt,
    };
  } finally {
    // The harness is disposable and can be large. Leaving it behind is how a long-lived
    // runner fills its disk and starts failing for reasons unrelated to any game.
    await rm(gameDir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Writes a stored version's sources into the harness as the game's own directory. */
async function materializeCandidate(store: GamesStore, manifest: VersionManifest, gameDir: string): Promise<void> {
  // Removed first: the harness may already carry this game from the context mirror, and a
  // candidate must be verified as *itself*, not as a merge over whatever was published.
  await rm(gameDir, { recursive: true, force: true });

  for (const relative of manifest.sourceFiles) {
    const content = await store.getSourceFile(manifest.slug, manifest.version, relative);
    if (content === null) throw new Error(`version ${manifest.version} claims ${relative}, which is not stored`);
    const target = path.join(gameDir, relative);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content, 'utf8');
  }
}

/** Stores what the check produced, so the shipped artifacts are the verified ones. */
async function collectArtifacts(
  deps: GateRunnerDeps,
  slug: string,
  version: string,
  harness: string,
  roots: NonNullable<GateRunnerDeps['artifactRoots']>,
): Promise<string[]> {
  const stored: string[] = [];

  // A green check with no servable document is not a pass. Letting it through would
  // store a version that reads as publishable and has nothing to publish — and the
  // failure would surface later, as a creator's preview that never appears, rather
  // than here where the run that caused it is still in front of someone.
  const bundle = await (deps.assembleBundle ?? assembleFromHarness)(harness, slug);
  if (bundle === null) throw new Error(`check:game passed for ${slug} but its sources could not be assembled`);
  await deps.store.putDerivedArtifact(
    slug,
    version,
    'bundle.html',
    Buffer.from(bundle, 'utf8'),
    'text/html; charset=utf-8',
  );
  stored.push('bundle.html');

  const mediaDir = path.join(harness, roots.media(slug));
  const { readdir } = await import('node:fs/promises');
  const entries = await readdir(mediaDir).catch(() => [] as string[]);
  for (const entry of entries) {
    if (!MEDIA_EXTENSIONS.includes(path.extname(entry).toLowerCase())) continue;
    const body = await readFile(path.join(mediaDir, entry)).catch(() => null);
    if (!body) continue;
    await deps.store.putDerivedArtifact(slug, version, `media/${entry}`, body, contentTypeFor(entry));
    stored.push(`media/${entry}`);
  }

  return stored;
}

function contentTypeFor(name: string): string {
  const extension = path.extname(name).toLowerCase();
  if (extension === '.png') return 'image/png';
  if (extension === '.mp4') return 'video/mp4';
  return 'application/json';
}

function tail(text: string, limit: number): string {
  return text.length <= limit ? text : `…\n${text.slice(-limit)}`;
}
