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
import type { GameProject } from '@gamedevpl/contract';
import { assembleGameHtml } from '../catalog/assemble.js';
import { firstGateScreenshotPath } from './gate-screenshot.js';
import {
  createGateStageBannerParser,
  gateProgressFor,
  type GateProgress,
  type GateProgressLane,
  type GateProgressStage,
} from './gate-progress.js';
import type { GamesStore, VersionManifest } from './games-store.js';
import { isKitEngineRefSupported, kitOutdatedReport, type KitRegistry } from '../agent-surface/kit-window.js';
import { createLocalGamesClient } from '../catalog/local-games-repo.js';

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
  /**
   * The candidate changes a committed behavioural golden.
   *
   * Only ever set by the proposal lane, and only alongside a green verdict — it says
   * "this passes, and it plays differently", which is a thing a human decides about, not
   * a thing a gate refuses.
   */
  behaviouralDiff?: boolean;
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
  /**
   * Proposal lane: the full check, but a behavioural-golden mismatch is a *finding*
   * rather than a refusal.
   *
   * A proposal that changes how the game plays is supposed to change `TRACE.json` — that
   * is what proposing a gameplay change means. Judging it against the golden recorded
   * before the change would fail every proposal worth reviewing, and a reviewer would
   * never see the ones that matter. So when the trace stage is the only thing standing
   * between a proposal and green, the golden is re-derived and the check re-run: if
   * everything else passes, the verdict is green with {@link GateOutcome.behaviouralDiff}
   * set, and the reviewer is told the game plays differently.
   *
   * This never lowers the bar on anything else. A proposal that fails typecheck, smoke,
   * validate, accept, or playtest is red exactly as any other candidate would be.
   */
  proposal?: boolean;
}

export type GateRunCommand = (
  command: string,
  args: string[],
  cwd: string,
  options?: { onChunk?: (text: string) => void },
) => Promise<{ code: number; output: string }>;

export interface GateRunnerDeps {
  store: GamesStore;
  /**
   * Materializes the games repo harness at `engineRef` into a working directory and
   * returns its path. Injected so the runner can be tested without a network or a clone.
   */
  prepareHarness(engineRef: string): Promise<string>;
  /** Runs a command in the harness. Returns combined output and the exit code. */
  run: GateRunCommand;
  /** Mid-gate milestones (best-effort). */
  onProgress?: (progress: GateProgress) => void | Promise<void>;
  now?: () => number;
  /** Where to look for artifacts the check produced, relative to the harness root. */
  artifactRoots?: { media: (slug: string) => string };
  /**
   * Builds the document that will actually be served, from the checked harness.
   * Injected so the runner can be tested without esbuild or a games-repo tree.
   */
  assembleBundle?: (harness: string, slug: string) => Promise<string | null>;
  /**
   * The Creator Kit window. Injected so tests can fix the registry without GCS;
   * production reads `kits/current.json` via {@link GamesStore.getKitRegistry}.
   */
  readKitRegistry?: () => Promise<KitRegistry | null>;
  /**
   * The semver a given kit was packed at, from that ref's own sidecar.
   *
   * Read per-ref rather than kept in the registry because the registry cannot carry a
   * list long enough to date an arbitrarily old delivery, and the sidecar is already
   * immutable and written once per kit. Only consulted when the ref is neither current
   * nor previous, so the common paths cost no extra read.
   */
  readKitVersion?: (engineRef: string) => Promise<string | null>;
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
  /**
   * Whether a preview run also takes stills.
   *
   * On by default because it is nearly free — the preview build already installs
   * Chrome for a capture it never runs — and because an agent that cannot run the
   * game otherwise iterates on prose. Env-killable rather than deploy-gated: if the
   * spend or the wall clock ever looks wrong, `GATE_PREVIEW_STILLS=0` stops it
   * without shipping code. The stage is advisory in the harness, so turning it off
   * (or a machine with no browser) costs frames, never a verdict.
   */
  const previewStills = previewRun && process.env.GATE_PREVIEW_STILLS !== '0';
  if (!healthRun && manifest.kitEngineRef) {
    const registry = await (deps.readKitRegistry ?? (() => deps.store.getKitRegistry()))().catch(() => null);
    // Only when the cheap checks did not already settle it, and only when the registry
    // is versioned at all — an unversioned one cannot compare majors, so the read
    // would buy nothing.
    const needsVersion =
      registry !== null &&
      Boolean(registry.currentVersion) &&
      manifest.kitEngineRef !== registry.current &&
      manifest.kitEngineRef !== registry.previous;
    const claimedVersion = needsVersion
      ? await (deps.readKitVersion ?? ((ref: string) => deps.store.getKitVersion(ref)))(manifest.kitEngineRef).catch(
          () => null,
        )
      : null;
    if (registry && !isKitEngineRefSupported(manifest.kitEngineRef, registry, claimedVersion)) {
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
  const lane: GateProgressLane = previewRun
    ? 'preview'
    : healthRun
      ? 'health'
      : options.proposal
        ? 'proposal'
        : 'publish';
  // Serialize progress; drain before return so verdict writes win.
  let progressChain: Promise<void> = Promise.resolve();
  const reportProgress = (stage: GateProgressStage): Promise<void> => {
    if (!deps.onProgress) return Promise.resolve();
    const next = progressChain.then(async () => {
      try {
        await deps.onProgress!(gateProgressFor(lane, stage, new Date(now()).toISOString()));
      } catch {
        /* advisory */
      }
    });
    progressChain = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  };
  const flushProgress = () => progressChain;
  await reportProgress('preparing');
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
    const feedStage = createGateStageBannerParser((stage) => {
      void reportProgress(stage);
    });
    let check = await deps.run(
      'npm',
      previewRun
        ? ['run', 'check:game', '--', slug, '--preview', ...(previewStills ? ['--preview-stills'] : [])]
        : ['run', 'check:game', '--', slug],
      harness,
      { onChunk: feedStage },
    );

    /*
     * The proposal lane's one concession, and it is narrow on purpose.
     *
     * A proposal that changes how the game plays changes `TRACE.json`, so the trace stage
     * refuses it — correctly, for a creator's own delivery, where a surprise behavioural
     * change is exactly what the golden exists to catch. For a proposal it is the point:
     * judged against the golden recorded before the change, every gameplay proposal is red
     * and no reviewer ever sees the ones worth seeing.
     *
     * So when the trace stage is the *only* thing that failed, the golden is re-derived and
     * the whole chain re-run. Everything else — typecheck, smoke, validate, capture, accept,
     * playtest — has to pass on its own merits against the regenerated trace, so this
     * converts one refusal into one finding rather than lowering the bar. If the re-run
     * fails for any reason, the original red verdict stands and its report is what the
     * proposer reads.
     */
    let behaviouralDiff = false;
    if (!previewRun && options.proposal && check.code !== 0 && failedOnlyOnTrace(check.output)) {
      await reportProgress('trace');
      const rederived = await deps.run('npm', ['run', 'trace', '--', slug, '--accept'], harness);
      if (rederived.code === 0) {
        const feedRerun = createGateStageBannerParser((stage) => {
          void reportProgress(stage);
        });
        const rerun = await deps.run('npm', ['run', 'check:game', '--', slug], harness, {
          onChunk: feedRerun,
        });
        if (rerun.code === 0) {
          behaviouralDiff = true;
          check = rerun;
          // Stored so the reviewer can see what the new behaviour actually is, and so an
          // accepted proposal carries a golden that matches the game it describes.
          const golden = await readFile(path.join(gameDir, 'TRACE.json')).catch(() => null);
          if (golden) {
            await deps.store
              .putDerivedArtifact(slug, version, 'source/TRACE.json', golden, 'text/plain; charset=utf-8')
              .catch(() => {});
          }
        }
      }
    }

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
      // Preview pass: Studio-playable document, plus stills when the harness took any.
      // Never bundle.html — that is the publish seal, and the caller writes previewGate
      // rather than gate, so nothing here can become publishable.
      //
      // The stills are the point of the lane for an agent that cannot run the game:
      // typecheck/smoke/build all pass without a pixel ever existing, so prose was the
      // only evidence it had. `storeCaptureMedia` is best-effort and the harness stage
      // is advisory, so a run with no browser simply stores the document as before.
      let previewArtifacts: string[];
      try {
        previewArtifacts = await storePreviewStrict(deps, slug, version, harness);
      } catch (error) {
        // Same rule as collectArtifacts below: nothing servable is not a pass.
        return {
          green: false,
          report: error instanceof Error ? error.message : String(error),
          artifacts: [],
          durationMs: now() - startedAt,
          ...(engineCommit ? { engineCommit } : {}),
        };
      }
      const artifacts = [
        ...previewArtifacts,
        ...(previewStills ? await storeCaptureMedia(deps, slug, version, harness, roots) : []),
      ];
      const screenshot = firstGateScreenshotPath(artifacts);
      return {
        green: true,
        report:
          `check:game --preview passed against engine ${engineCommit ?? engineRef}; ` +
          `${artifacts.length} artifact(s) stored`,
        artifacts,
        durationMs: now() - startedAt,
        ...(engineCommit ? { engineCommit } : {}),
        ...(screenshot ? { screenshot } : {}),
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
      report:
        `check:game passed against engine ${engineCommit ?? engineRef}; ${artifacts.length} artifacts stored` +
        // Named in the report as well as flagged on the outcome: the report is what an
        // operator reads in the Cloud Build history, where the flag is not visible.
        (behaviouralDiff ? '; behavioural golden re-derived (this proposal changes how the game plays)' : ''),
      artifacts,
      durationMs: now() - startedAt,
      ...(engineCommit ? { engineCommit } : {}),
      ...(screenshot ? { screenshot } : {}),
      ...(behaviouralDiff ? { behaviouralDiff: true } : {}),
    };
  } finally {
    await flushProgress();
    // The harness is disposable and can be large. Leaving it behind is how a long-lived
    // runner fills its disk and starts failing for reasons unrelated to any game.
    await rm(gameDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Whether a failed `check:game` failed at the trace stage and nowhere else.
 *
 * Deliberately conservative: it must see the trace stage named as the failure *and* see
 * no other stage reporting one. A parse that guessed wrong in the permissive direction
 * would turn "this proposal is broken" into "this proposal plays differently", which is
 * the one mistake this lane must not make — a reviewer would be handed a red game with a
 * green badge.
 *
 * Matching on the harness's own stage vocabulary rather than on exit codes because
 * `check:game` is a chain that reports which link broke; the exit code only says one did.
 */
export function failedOnlyOnTrace(output: string): boolean {
  const text = output.toLowerCase();
  const mentionsTrace = /trace(\.json)?\b/.test(text) && /(differ|mismatch|does not match|changed)/.test(text);
  if (!mentionsTrace) return false;
  // Any other stage naming a failure disqualifies the shortcut.
  const otherStageFailed =
    /(typecheck|smoke|validate|webgl|audio|ios|no-js|gfx|accept|playtest|build)\b[^\n]*(fail|error)/.test(text);
  return !otherStageFailed;
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
    return await storePreviewStrict(deps, slug, version, harness);
  } catch {
    return [];
  }
}

async function storePreviewStrict(
  deps: GateRunnerDeps,
  slug: string,
  version: string,
  harness: string,
): Promise<string[]> {
  const preview = await (deps.assembleBundle ?? assembleFromHarness)(harness, slug);
  if (preview === null) {
    throw new Error(`check:game --preview passed for ${slug} but its sources could not be assembled`);
  }
  await deps.store.putDerivedArtifact(
    slug,
    version,
    'preview.html',
    Buffer.from(preview, 'utf8'),
    'text/html; charset=utf-8',
  );
  return ['preview.html'];
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
