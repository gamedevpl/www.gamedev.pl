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
import { firstGateScreenshotPath } from './gate-screenshot.js';
import type { GamesStore, VersionManifest } from './games-store.js';
import { isKitEngineRefSupported, kitOutdatedReport, type KitRegistry } from './kit-window.js';
import { createLocalGamesClient } from './local-games-repo.js';

export interface GateOutcome {
  green: boolean;
  /** Human-readable summary, recorded on the manifest and shown to the operator. */
  report: string;
  /** What the run produced, when it got far enough to produce anything. */
  artifacts: string[];
  /** How long the check took — the number that tells us if this is affordable. */
  durationMs: number;
  /**
   * The engine commit the run actually checked against, read from the harness itself
   * (`git rev-parse HEAD`) rather than trusted from the ref that requested it. A ref
   * like `main` names a moving target; this is where it was standing when the verdict
   * was rendered — the sha that makes "it worked when we checked" checkable later.
   */
  engineCommit?: string;
  /** Set when the delivery's kitEngineRef is outside `kits/current.json`'s window. */
  status?: 'kit_outdated';
  /** First capture PNG path under the version prefix, when one was stored. */
  screenshot?: string;
}

export interface GateRunOptions {
  /**
   * Check against this engine ref instead of the manifest's pin. Health runs use it to
   * ask the question the pin exists to avoid: "does this game work on *today's* engine,
   * not the one it was accepted against".
   */
  engineRef?: string;
  /**
   * Preview lane: `check:game --preview` (typecheck→smoke→build). Never stores
   * bundle.html / publishable green — only preview.html.
   */
  preview?: boolean;
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
  /**
   * The Creator Kit N/N−1 window. Injected so tests can fix the registry without GCS;
   * production reads `kits/current.json` via {@link GamesStore.getKitRegistry}.
   */
  readKitRegistry?: () => Promise<KitRegistry | null>;
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
export async function runGate(
  slug: string,
  version: string,
  deps: GateRunnerDeps,
  options: GateRunOptions = {},
): Promise<GateOutcome> {
  const now = deps.now ?? Date.now;
  const roots = deps.artifactRoots ?? DEFAULT_ARTIFACT_ROOTS;
  const startedAt = now();

  const manifest = await deps.store.getManifest(slug, version);
  if (!manifest) {
    return { green: false, report: `no such version: ${slug}@${version}`, artifacts: [], durationMs: 0 };
  }

  // Kit window before any harness work: a delivery outside N/N−1 must not burn a
  // check:game run. Health re-gates skip this — they ask about today's engine, not
  // whether the original kit claim was still supported.
  const healthRun = Boolean(options.engineRef);
  const previewRun = Boolean(options.preview);
  if (!healthRun && manifest.kitEngineRef) {
    const registry = await (deps.readKitRegistry ?? (() => deps.store.getKitRegistry()))().catch(() => null);
    if (registry && !isKitEngineRefSupported(manifest.kitEngineRef, registry)) {
      return {
        green: false,
        status: 'kit_outdated',
        report: kitOutdatedReport(manifest.kitEngineRef, registry),
        artifacts: [],
        durationMs: now() - startedAt,
      };
    }
  }

  // Deliveries do not pin an engine commit yet — dispatch targets `main`, a moving
  // branch — so a first gate run checks against wherever `main` stands and stamps the
  // resolved sha back onto the manifest (see the caller). A *re*-run of a stamped
  // version checks against that pin, which is what keeps a green verdict reproducible
  // after the engine moves on. Health runs override the pin on purpose: their whole
  // question is whether the game survives the engine having moved.
  const engineRef = options.engineRef ?? manifest.engineRef ?? 'main';
  const harness = await deps.prepareHarness(engineRef);
  // Best effort: an outcome without the sha is poorer, not wrong, and a verdict must
  // not be discarded because a bookkeeping read failed.
  const engineCommit = await deps
    .run('git', ['rev-parse', 'HEAD'], harness)
    .then((head) => (head.code === 0 ? head.output.trim().split('\n').pop()?.trim() : undefined))
    .catch(() => undefined);
  const gameDir = path.join(harness, 'games', slug);

  try {
    await materializeCandidate(deps.store, manifest, gameDir);

    // A content-only Studio publish (`origin: 'editor'`) carries a TRACE.json that
    // was recorded against the *previous* content, so replaying it against the new
    // maps would fail the trace stage for every honest edit. For these versions the
    // gate re-derives the behavioural golden first — trace becomes a derived
    // artifact, exactly like the bundle and media — and stores it on the version so
    // provenance shows what was actually replayed. Everything downstream (capture,
    // validate including Check 31, accept, playtest) still judges the edited
    // content for real; `--accept` here only retires the has-it-changed question,
    // which for a content edit is always answered "yes, that was the point".
    // Preview lane skips this: it never reaches the trace stage.
    if (!previewRun && manifest.origin === 'editor') {
      const trace = await deps.run('npm', ['run', 'trace', '--', slug, '--accept'], harness);
      if (trace.code !== 0) {
        return {
          green: false,
          report: tail(trace.output, 4000),
          artifacts: [],
          durationMs: now() - startedAt,
          ...(engineCommit ? { engineCommit } : {}),
        };
      }
      const golden = await readFile(path.join(gameDir, 'TRACE.json')).catch(() => null);
      if (golden) {
        await deps.store
          .putDerivedArtifact(slug, version, 'source/TRACE.json', golden, 'text/plain; charset=utf-8')
          .catch(() => {});
      }
    }

    // Preview: typecheck→smoke→build only. Publish: full check:game without `--accept`
    // (that flag re-records the behavioural golden instead of checking against it).
    const check = await deps.run(
      'npm',
      previewRun ? ['run', 'check:game', '--', slug, '--preview'] : ['run', 'check:game', '--', slug],
      harness,
    );
    if (check.code !== 0) {
      // Preview for the creator; media when capture got far enough — both best-effort.
      // Preview lane never runs capture, so media store is a no-op there.
      const artifacts = [
        ...(await storePreview(deps, slug, version, harness)),
        ...(previewRun ? [] : await storeCaptureMedia(deps, slug, version, harness, roots)),
      ];
      const screenshot = firstGateScreenshotPath(artifacts);
      return {
        green: false,
        // The tail, not the head: the chain fails at the bottom and the last lines are
        // the ones naming the check that stopped it.
        report: tail(check.output, 4000),
        // A red verdict is about whether this may be *published*. It is not a reason the
        // creator should be unable to look at what their agent built — and for a while
        // it was exactly that: a red gate stored nothing, the draft preview serves a
        // gate artifact, so a build that finished reached the studio as an empty panel
        // with no explanation. Stored under its own name, never `bundle.html`: publishing
        // checks `manifest.gate.green` and the play route reads only the bundle, so an
        // unverified document has no path to a player either way.
        artifacts,
        durationMs: now() - startedAt,
        ...(engineCommit ? { engineCommit } : {}),
        ...(screenshot ? { screenshot } : {}),
      };
    }

    if (previewRun) {
      // Preview pass: Studio-playable document only. Never bundle.html / media — those
      // are publish seals. Caller writes previewGate, not gate.
      const artifacts = await storePreview(deps, slug, version, harness);
      return {
        green: true,
        report: `check:game --preview passed against engine ${engineCommit ?? engineRef}; preview.html stored`,
        artifacts,
        durationMs: now() - startedAt,
        ...(engineCommit ? { engineCommit } : {}),
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
        ...(engineCommit ? { engineCommit } : {}),
      };
    }

    const screenshot = firstGateScreenshotPath(artifacts);
    return {
      green: true,
      report: `check:game passed against engine ${engineCommit ?? engineRef}; ${artifacts.length} artifacts stored`,
      artifacts,
      durationMs: now() - startedAt,
      ...(engineCommit ? { engineCommit } : {}),
      ...(screenshot ? { screenshot } : {}),
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

/**
 * Stores a playable document for a candidate the check refused.
 *
 * Assembled by the same function and from the same materialized sources as the green
 * path's `bundle.html`, so it carries the identical serve-time policy — the restrictive
 * CSP, the provenance marking, the credential scan, the byte budget. What it does not
 * carry is a verdict, which is why it lives under a different name and why nothing that
 * serves a *published* game will look at it.
 *
 * Best effort by construction. A candidate can fail the check precisely because it
 * cannot be assembled — sources that do not transpile, a credential in the bundle, a
 * document over budget — and in that case there is no preview to store and the red
 * verdict already says everything there is to say. Throwing here would turn a reported
 * failure into a crashed gate, which is strictly less information.
 */
async function storePreview(deps: GateRunnerDeps, slug: string, version: string, harness: string): Promise<string[]> {
  try {
    const preview = await (deps.assembleBundle ?? assembleFromHarness)(harness, slug);
    if (preview === null) return [];
    await deps.store.putDerivedArtifact(
      slug,
      version,
      'preview.html',
      Buffer.from(preview, 'utf8'),
      'text/html; charset=utf-8',
    );
    return ['preview.html'];
  } catch {
    return [];
  }
}

/** Stores capture media the check left under the game directory, when any. */
async function storeCaptureMedia(
  deps: GateRunnerDeps,
  slug: string,
  version: string,
  harness: string,
  roots: NonNullable<GateRunnerDeps['artifactRoots']>,
): Promise<string[]> {
  // Best-effort end to end: a red check already has a report the agent can act on, and
  // a transient GCS blip on an optional screenshot must not discard that verdict
  // (Codex: awaited throw here used to prevent putGateResult).
  try {
    const mediaDir = path.join(harness, roots.media(slug));
    const { readdir } = await import('node:fs/promises');
    const entries = await readdir(mediaDir).catch(() => [] as string[]);
    const stored: string[] = [];
    for (const entry of entries) {
      if (!MEDIA_EXTENSIONS.includes(path.extname(entry).toLowerCase())) continue;
      const body = await readFile(path.join(mediaDir, entry)).catch(() => null);
      if (!body) continue;
      try {
        await deps.store.putDerivedArtifact(slug, version, `media/${entry}`, body, contentTypeFor(entry));
        stored.push(`media/${entry}`);
      } catch {
        // Skip this file; keep trying the rest.
      }
    }
    return stored;
  } catch {
    return [];
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
  stored.push(...(await storeCaptureMedia(deps, slug, version, harness, roots)));

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
