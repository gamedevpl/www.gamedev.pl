// Renders whatever the agent has staged so far, before it ever submits.
//
// The measured gap this closes is the MCP one. A ChatGPT- or Claude-class agent building
// through `stage_source_file` uploads its tree a path at a time, and nothing looks at that
// buffer until `submit_sources` — after which a Cloud Build gate run (apt install, `npm
// ci`, the whole check chain) stands between the creator and a playable document. So for
// the entire stretch where a game already exists in the bucket, the Studio thread has
// nothing to show but sentences, and the creator watches a status page while the agent
// tunes details it cannot see.
//
// The platform lane solved this already, in the games repo's `tools/preview-watch.ts`: a
// loop that assembles whatever currently compiles and pushes the bytes when they change,
// costing the agent no turns because it asks the agent for nothing. This is the same idea
// on our side of the wire, for a lane where there is no watcher process to run one — the
// staging buffer *is* the working tree, and we already hold it.
//
// Three deliberate properties:
//
//   - **It reuses the serve path, not a preview-only variant.** `getGameSources` bundles
//     the game against the engine and `assembleGameHtml` applies the restrictive CSP, the
//     AI-Act provenance marking, the credential scan and the byte cap — the same hygiene a
//     published game passes. Exactly what `publishSeedPreview` does for round 0.
//   - **It lands in the same `BuildPreview` slot** the watcher and the seed use, so Studio
//     needed no new rail: the agent's own gate-built preview simply supersedes this one.
//   - **Failure is the normal state and is silent.** A half-staged tree does not compile,
//     and a game being written does not compile most of the time. Only a successful
//     assembly replaces the last good preview; everything else leaves it standing.
//
// It never touches a gate verdict. A staged preview is not a candidate version, cannot
// publish, and is served back under the same sandbox as any other unreviewed agent output.

import { createHash } from 'node:crypto';
import { assembleGameHtml, CredentialLeakError, EmptyProjectError, ProjectTooLargeError } from '../catalog/assemble.js';
import { MAX_BUILD_PREVIEW_BYTES } from './build-preview-limits.js';
import type { GamesStore, SourceFile } from './games-store.js';
import { hasPlayableHowToPlay } from '../catalog/index-html-generator.js';
import type { GitHubClient } from '../catalog/github-client.js';
import {
  resolveRoundBaseVersion,
  type BaseVersionRecord,
  type BaseVersionStore,
} from '../creation/round-base-version.js';
import type { Store } from '../platform/store.js';

/**
 * The label is authored in both languages rather than machine translated, for the same
 * reason the seed preview's is: it is one fixed sentence, and it is the caption on the
 * first thing a creator gets to play.
 */
export const STAGED_PREVIEW_LABEL = 'Live preview — the agent is still writing this';
export const STAGED_PREVIEW_LABEL_PL = 'Podgląd na żywo — agent wciąż nad tym pracuje';

/**
 * How long to wait after a staged file before assembling.
 *
 * Agents stage a tree in a burst — a dozen `stage_source_file` calls seconds apart — and
 * assembling after each one would spend an esbuild pass and a fan-out of engine reads on
 * a tree that is knowingly half-written. Waiting for the burst to settle costs the creator
 * a few seconds and saves most of the work.
 *
 * Restarted by every staged file, so it measures quiet *after* the last one rather than
 * time since the first: an assembly armed by the first file of a slowly-uploaded tree
 * fires on three files of a game and reports `incomplete`, and then the gap floor holds
 * the real preview back — the opposite of the point. {@link STAGED_PREVIEW_MAX_WAIT_MS}
 * bounds the restarting.
 */
export const STAGED_PREVIEW_DEBOUNCE_MS = 6_000;

/**
 * Floor between two assemblies for one job.
 *
 * An agent rewriting one file at a time for twenty minutes is working exactly as intended
 * and must not be able to drive a rebuild per keystroke. The watcher on the platform lane
 * settled on twenty seconds for the same reason; this is a shade slower because our
 * assembly reads the engine over the network rather than off a local checkout.
 */
export const STAGED_PREVIEW_MIN_GAP_MS = 25_000;

/**
 * Longest a settling burst may hold the first assembly back.
 *
 * The debounce restarts on every staged file, which is what makes it trailing-edge — but
 * an agent that keeps staging every few seconds for a minute would restart it forever and
 * the creator would watch a status page through the whole thing, which is the exact
 * failure this module exists to end. Past this point the assembly happens on the tree as
 * it stands, and the next one is governed by the gap floor as usual.
 */
export const STAGED_PREVIEW_MAX_WAIT_MS = 20_000;

/**
 * How long to wait before re-trying a job whose assembly was already running.
 *
 * Short, because the thing it is waiting for takes seconds — but never zero: once the
 * max-wait above has elapsed the computed delay is 0, and a re-arm at 0ms against a
 * still-running assembly is a busy loop.
 */
export const STAGED_PREVIEW_BUSY_RETRY_MS = 1_000;

/**
 * Assemblies allowed to run at once across the process.
 *
 * The bound exists because this work is the exact fan-out `game-snapshot.ts` was written
 * to keep off the play route — GitHub reads for the engine plus an esbuild bundle. One
 * instance may hold many active rounds, and a burst of staging across all of them must not
 * turn into a burst of assemblies competing with real requests.
 */
export const MAX_CONCURRENT_STAGED_PREVIEWS = 2;

/** Cap on the per-job bookkeeping map, so a long-lived instance cannot grow it forever. */
export const MAX_STAGED_PREVIEW_JOBS = 2_000;

/**
 * Files the assembler normally reads from the game's own tree. `style.css` can instead
 * be generated from the `theme` in GAME.json, so the readiness predicate below treats it
 * as optional only for that explicit case.
 *
 * `getGameSources` reads them from the ref when an overlay does not carry them, and a
 * self-build game usually lives in no ref at all — so a tree missing any of these is not
 * an error, it is a game that has not been staged far enough to run yet.
 */
export const PLAYABLE_OVERLAY_FILES = ['game.ts', 'style.css', 'GAME.json'] as const;

/**
 * What one attempt did. Every value except `published` leaves the previous preview alone;
 * they are distinguished so the log can say which kind of nothing happened.
 */
export type StagedPreviewOutcome =
  /** A new document was stored. */
  | 'published'
  /** Assembled to the same bytes as last time — nothing to tell the creator. */
  | 'unchanged'
  /** Nothing staged for this round yet. */
  | 'not_staged'
  /** The overlay cannot make a runnable game yet (missing entry files, or it did not bundle). */
  | 'incomplete'
  /** Assembled, but over the stored-preview ceiling. */
  | 'too_large'
  /** The job is gone, abandoned, or has no slug. */
  | 'skipped'
  /** Something threw. Logged, never surfaced to the agent. */
  | 'failed';

/** One layer of the overlay, newest-wins. Absent layers are simply not passed. */
export type OverlayLayers = {
  /** The round's staging buffer — what the agent is writing right now. */
  staged?: Array<SourceFile & { deleted?: true }>;
  /** The last version this game delivered, so a one-file tweak still renders a whole game. */
  delivered?: SourceFile[];
  /** The generated round-0 draft, when the agent has not replaced it yet. */
  seed?: SourceFile[];
};

/**
 * Flattens the layers into the `overrides` map `getGameSources` takes.
 *
 * Order is the whole point. An improvement round stages one edited file against a game
 * that already exists, and a new round stages against a seed it is part-way through
 * replacing — in both cases rendering the staged file alone would show a game with holes,
 * and rendering the base alone would show work the agent has already moved past. Staged
 * beats delivered beats seed, which is newest-first by construction.
 */
export function overlayGameSources(layers: OverlayLayers): Record<string, string> {
  const overlay: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const layer of [layers.seed, layers.delivered]) {
    for (const file of layer ?? []) overlay[file.path] = file.content;
  }
  for (const file of layers.staged ?? []) {
    if (file.deleted) delete overlay[file.path];
    else overlay[file.path] = file.content;
  }
  return overlay;
}

/**
 * The delivered sources a round improves, when there are any.
 *
 * Reads the same base version the channel's `GET /sources` does (round-base-version.ts),
 * because an improvement round inherits a slug long before it delivers anything of its
 * own, and without the base layer a one-file stage would render (or typecheck) a game
 * with holes.
 */
export async function readDeliveredSources(input: {
  gamesStore: Pick<GamesStore, 'getManifest' | 'getSourceFile'>;
  store: BaseVersionStore;
  record: BaseVersionRecord & { slug?: string };
}): Promise<SourceFile[]> {
  const { gamesStore, store, record } = input;
  const slug = record.slug;
  if (!slug) return [];
  const version = await resolveRoundBaseVersion(store, record, slug);
  if (!version) return [];

  const manifest = await gamesStore.getManifest(slug, version);
  if (!manifest) return [];
  const files = await Promise.all(
    manifest.sourceFiles.map(async (path) => ({
      path,
      content: await gamesStore.getSourceFile(slug, version!, path),
    })),
  );
  // A hole in the base is not fatal: the staged layer may supply that very file, and
  // a caller-specific readiness check (or the typecheck itself) reports the rest.
  return files.filter((file): file is SourceFile => file.content !== null);
}

/** True when the overlay carries everything an assembly needs from the game's own tree. */
export function hasPlayableOverlay(overlay: Record<string, string>): boolean {
  // trim(), matching getGameSources: a whitespace-only file is absent, not staged.
  const staged = (path: string): boolean => typeof overlay[path] === 'string' && overlay[path].trim().length > 0;
  if (!staged('game.ts') || !staged('GAME.json')) return false;
  // Neither means half-staged: a quiet no.
  if (!staged('index.html') && !manifestDeclaresHowToPlay(overlay['GAME.json'])) return false;
  // The assembler derives CSS from GAME.json themes.
  // Otherwise require style.css to reject partial trees.
  return staged('style.css') || manifestDeclaresTheme(overlay['GAME.json']);
}

function manifestDeclaresHowToPlay(source: string | undefined): boolean {
  if (typeof source !== 'string') return false;
  try {
    const manifest = JSON.parse(source) as { howToPlay?: unknown };
    return hasPlayableHowToPlay(manifest.howToPlay);
  } catch {
    // Mid-write manifests are invalid JSON
    return false;
  }
}

function manifestDeclaresTheme(source: string | undefined): boolean {
  if (typeof source !== 'string') return false;
  try {
    const manifest = JSON.parse(source) as { theme?: unknown };
    return typeof manifest.theme === 'object' && manifest.theme !== null;
  } catch {
    return false;
  }
}

/** Same shape `mcp-presence.ts` uses: callers own the map, this keeps it bounded. */
function noteJob<K, V>(entries: Map<K, V>, key: K, value: V, maxJobs = MAX_STAGED_PREVIEW_JOBS): void {
  entries.delete(key);
  entries.set(key, value);
  while (entries.size > maxJobs) {
    const oldest = entries.keys().next().value;
    if (oldest === undefined) break;
    entries.delete(oldest);
  }
}

export interface StagedPreviewOptions {
  store: Pick<
    Store,
    'getSubmission' | 'getPublication' | 'listSubmissionsByOwner' | 'appendBuildPreview' | 'pruneBuildPreviews'
  >;
  gamesStore: Pick<GamesStore, 'getStagedSourceFiles' | 'getManifest' | 'getSourceFile'> & {
    putDerivedArtifact?: GamesStore['putDerivedArtifact'];
  };
  /** Supplies the *engine* half only — every game file comes from the overlay. */
  githubClient: Pick<GitHubClient, 'getGameSources'>;
  /**
   * Games-repo ref the engine is read from. The published ref rather than the delivery's
   * `kitEngineRef`: an agent does not name a kit until it submits, and for a rough preview
   * the freshest engine is a better guess than none. The gate still judges a real delivery
   * against the ref that delivery pins, so nothing here can make a version look accepted.
   */
  engineRef: string;
  /** How many previews are kept per job — matches the channel's own pruning. */
  keepPreviews?: number;
  /** Called after a preview lands, so a cached status response is dropped. */
  onPublished?: (issueNumber: number) => void;
  log: {
    warn: (context: object, message: string) => void;
    error: (context: object, message: string) => void;
    // Optional: per-phase timing logged after a successful assembly.
    info?: (context: object, message: string) => void;
  };
  now?: () => number;
  debounceMs?: number;
  minGapMs?: number;
  maxBytes?: number;
  maxConcurrent?: number;
  /** Ceiling on how long a settling burst may defer its first assembly. */
  maxWaitMs?: number;
  /** Re-arm delay when the job (or the process) is already assembling. */
  busyRetryMs?: number;
}

export interface CandidatePreviewInput {
  issueNumber: number;
  slug: string;
  version: string;
  roundGeneration?: number;
  files: SourceFile[];
  kitEngineRef?: string;
  locale?: string;
}

export interface StagedPreviewPublisher {
  /**
   * Note that a file was staged. Coalesces into one assembly per burst and never
   * throws — callers are request handlers that owe the agent an answer either way.
   */
  schedule(issueNumber: number): void;
  /** Runs one attempt now, bypassing the timers. The seam the tests drive. */
  publishNow(issueNumber: number): Promise<StagedPreviewOutcome>;
  /**
   * Assembles and stores an immediate fast preview for a delivered candidate version,
   * bounded by the publisher's concurrency limit, without ref fallback.
   */
  publishCandidate(input: CandidatePreviewInput): Promise<StagedPreviewOutcome>;
  /** Drops pending timers. For tests and shutdown; not needed in normal operation. */
  stop(): void;
}

export function createStagedPreviewPublisher(options: StagedPreviewOptions): StagedPreviewPublisher {
  const now = options.now ?? Date.now;
  const debounceMs = options.debounceMs ?? STAGED_PREVIEW_DEBOUNCE_MS;
  const minGapMs = options.minGapMs ?? STAGED_PREVIEW_MIN_GAP_MS;
  const maxBytes = options.maxBytes ?? MAX_BUILD_PREVIEW_BYTES;
  const maxConcurrent = options.maxConcurrent ?? MAX_CONCURRENT_STAGED_PREVIEWS;
  const maxWaitMs = options.maxWaitMs ?? STAGED_PREVIEW_MAX_WAIT_MS;
  const busyRetryMs = options.busyRetryMs ?? STAGED_PREVIEW_BUSY_RETRY_MS;
  const keepPreviews = options.keepPreviews ?? 4;

  /**
   * The one armed timer per job, with the moment its burst began — restarting the
   * debounce must not restart the max-wait, or a steady stream never assembles.
   */
  const pending = new Map<number, { timer: NodeJS.Timeout; burstStartedAt: number }>();
  const lastAttemptAt = new Map<number, number>();
  const running = new Set<number>();
  /**
   * Digest of the last document published per round.
   *
   * Keyed by round as well as job because a new round starts from a fresh staging buffer,
   * and a round that happens to re-stage the previous round's final tree should still get
   * its own preview rather than being told nothing changed.
   */
  const lastDigest = new Map<string, string>();
  let inFlight = 0;

  async function attempt(issueNumber: number): Promise<StagedPreviewOutcome> {
    const attemptStartedAt = Date.now();
    const record = await options.store.getSubmission(issueNumber);
    if (!record?.slug || record.abandonedAt) return 'skipped';
    const slug = record.slug;
    const roundGeneration = record.roundGeneration ?? 1;

    const staged = await options.gamesStore.getStagedSourceFiles({ slug, issueNumber, roundGeneration });
    if (staged.length === 0) return 'not_staged';

    const overlayStartedAt = Date.now();
    const overlay = overlayGameSources({
      staged,
      delivered: await readDeliveredSources({ gamesStore: options.gamesStore, store: options.store, record }),
      ...(record.seed?.files ? { seed: record.seed.files } : {}),
    });
    const overlayMs = Date.now() - overlayStartedAt;
    if (!hasPlayableOverlay(overlay)) return 'incomplete';

    // Every game file comes from the overlay; the ref supplies `shared/` alone. That is
    // what lets this render a game which exists in no branch and no repository — which is
    // every self-build game, and the reason this could not simply read a ref.
    const sources = await options.githubClient.getGameSources(options.engineRef, slug, overlay);
    if (!sources) return 'incomplete';

    const assembleStartedAt = Date.now();
    const html = assembleGameHtml(
      {
        title: sources.title ?? slug,
        description: '',
        html: sources.indexHtml,
        js: sources.gameJs,
        css: sources.styleCss,
      },
      { restrictNetwork: true },
    );
    const assembleMs = Date.now() - assembleStartedAt;
    if (Buffer.byteLength(html, 'utf8') > maxBytes) return 'too_large';

    // Cheap guard against a thrash the creator would see as a flickering preview: an agent
    // that stages a file back to the bytes it already had produces the same document, and
    // a new row on the rail claiming an update would be a lie about work that happened.
    const digestKey = `${issueNumber}:${roundGeneration}`;
    const digest = createHash('sha256').update(html).digest('hex');
    if (lastDigest.get(digestKey) === digest) return 'unchanged';

    const storeWriteStartedAt = Date.now();
    const locale = record.locale ?? '';
    await options.store.appendBuildPreview(issueNumber, {
      data: Buffer.from(html, 'utf8').toString('base64'),
      slug,
      label: STAGED_PREVIEW_LABEL,
      ...(locale.startsWith('pl') ? { labelLocalized: STAGED_PREVIEW_LABEL_PL, locale } : {}),
    });
    // After the write, like the channel's own preview verb: a push that lands and then
    // fails to tidy up has still delivered the thing the creator was waiting for.
    await options.store.pruneBuildPreviews(issueNumber, keepPreviews).catch(() => 0);
    const storeWriteMs = Date.now() - storeWriteStartedAt;
    noteJob(lastDigest, digestKey, digest);
    options.onPublished?.(issueNumber);
    // Per-phase timing — see docs/live-editing-latency.md.
    options.log.info?.(
      {
        issueNumber,
        totalMs: Date.now() - attemptStartedAt,
        overlayMs,
        getGameSourcesMs: sources.timings?.totalMs,
        getGameSourcesPhases: sources.timings,
        assembleMs,
        storeWriteMs,
      },
      'staged preview assembled',
    );
    return 'published';
  }

  async function publishNow(issueNumber: number): Promise<StagedPreviewOutcome> {
    if (running.has(issueNumber)) return 'skipped';
    running.add(issueNumber);
    inFlight += 1;
    try {
      return await attempt(issueNumber);
    } catch (error) {
      // A game being written does not compile, and neither an agent nor a creator can act
      // on that fact — so it is recorded and dropped rather than raised. The hygiene
      // errors are named separately because they mean something specific about the
      // *content*: a game too large or carrying credential-shaped strings would be
      // refused by the publish path too, and that is worth seeing in the log as itself.
      const known =
        error instanceof EmptyProjectError ||
        error instanceof ProjectTooLargeError ||
        error instanceof CredentialLeakError;
      options.log.warn(
        { issueNumber, err: error, ...(known ? { hygiene: true } : {}) },
        'staged preview could not be assembled',
      );
      return 'failed';
    } finally {
      running.delete(issueNumber);
      inFlight -= 1;
      noteJob(lastAttemptAt, issueNumber, now());
    }
  }

  /**
   * Arms the one timer this job may have, from three independent floors.
   *
   * `settle` is the trailing-edge debounce, shortened as the burst approaches its
   * max-wait; `gap` is the per-job floor between assemblies; `atLeast` is what a
   * busy re-arm needs so it cannot spin. The latest of the three wins.
   */
  function arm(issueNumber: number, burstStartedAt: number, atLeast = 0): void {
    const current = now();
    const sinceLast = current - (lastAttemptAt.get(issueNumber) ?? Number.NEGATIVE_INFINITY);
    const gap = Number.isFinite(sinceLast) ? Math.max(0, minGapMs - sinceLast) : 0;
    const settle = Math.min(debounceMs, Math.max(0, burstStartedAt + maxWaitMs - current));
    const timer = setTimeout(
      () => {
        pending.delete(issueNumber);
        // A job already assembling, or a process at its concurrency ceiling, must be
        // *re-armed* rather than run: `publishNow` would answer `skipped` and this file
        // would then wait for a stage that may never come, because the burst it belongs
        // to may have just ended. Re-arming keeps the burst's own max-wait window.
        if (running.has(issueNumber) || inFlight >= maxConcurrent) {
          arm(issueNumber, burstStartedAt, busyRetryMs);
          return;
        }
        void publishNow(issueNumber).catch((error: unknown) => {
          options.log.error({ issueNumber, err: error }, 'staged preview attempt failed unexpectedly');
        });
      },
      Math.max(gap, settle, atLeast),
    );
    // Never a reason to hold the process open — this is courtesy work beside a build.
    timer.unref?.();
    pending.set(issueNumber, { timer, burstStartedAt });
  }

  function schedule(issueNumber: number): void {
    // Trailing edge: every staged file restarts the clock, so the assembly lands after
    // the *last* of a burst rather than being armed by the first and firing on a tree
    // that is still half-uploaded. `burstStartedAt` survives the restart, which is what
    // stops a steady staging stream from deferring the first preview forever.
    const existing = pending.get(issueNumber);
    if (existing) clearTimeout(existing.timer);
    arm(issueNumber, existing?.burstStartedAt ?? now());
  }

  function stop(): void {
    for (const { timer } of pending.values()) clearTimeout(timer);
    pending.clear();
  }

  async function publishCandidate(input: CandidatePreviewInput): Promise<StagedPreviewOutcome> {
    const { issueNumber, slug, version, files } = input;
    const existing = pending.get(issueNumber);
    if (existing) {
      clearTimeout(existing.timer);
      pending.delete(issueNumber);
    }

    if (running.has(issueNumber) || inFlight >= maxConcurrent) {
      return 'skipped';
    }

    running.add(issueNumber);
    inFlight += 1;
    const attemptStartedAt = Date.now();
    try {
      const overlay: Record<string, string> = Object.create(null) as Record<string, string>;
      for (const file of files) {
        overlay[file.path] = file.content;
      }
      if (!hasPlayableOverlay(overlay)) return 'incomplete';

      const engineRef = input.kitEngineRef || options.engineRef;
      const sources = await options.githubClient.getGameSources(engineRef, slug, overlay, { noRefFallback: true });
      if (!sources) return 'incomplete';

      const assembleStartedAt = Date.now();
      const html = assembleGameHtml(
        {
          title: sources.title ?? slug,
          description: '',
          html: sources.indexHtml,
          js: sources.gameJs,
          css: sources.styleCss,
        },
        { restrictNetwork: true },
      );
      const assembleMs = Date.now() - assembleStartedAt;
      if (Buffer.byteLength(html, 'utf8') > maxBytes) return 'too_large';

      if (options.gamesStore.putDerivedArtifact) {
        await options.gamesStore.putDerivedArtifact(
          slug,
          version,
          'preview.html',
          Buffer.from(html, 'utf8'),
          'text/html; charset=utf-8',
        );
      }

      const roundGen = input.roundGeneration ?? 1;
      const digestKey = `${issueNumber}:${roundGen}`;
      const digest = createHash('sha256').update(html).digest('hex');
      noteJob(lastDigest, digestKey, digest);

      const storeWriteStartedAt = Date.now();
      const locale = input.locale ?? '';
      await options.store.appendBuildPreview(issueNumber, {
        data: Buffer.from(html, 'utf8').toString('base64'),
        slug,
        label: STAGED_PREVIEW_LABEL,
        ...(locale.startsWith('pl') ? { labelLocalized: STAGED_PREVIEW_LABEL_PL, locale } : {}),
      });
      await options.store.pruneBuildPreviews(issueNumber, keepPreviews).catch(() => 0);
      const storeWriteMs = Date.now() - storeWriteStartedAt;

      options.onPublished?.(issueNumber);
      options.log.info?.(
        {
          issueNumber,
          version,
          totalMs: Date.now() - attemptStartedAt,
          getGameSourcesMs: sources.timings?.totalMs,
          assembleMs,
          storeWriteMs,
        },
        'candidate preview assembled',
      );
      return 'published';
    } catch (error) {
      options.log.warn({ issueNumber, version, err: error }, 'candidate preview could not be assembled');
      return 'failed';
    } finally {
      running.delete(issueNumber);
      inFlight -= 1;
      noteJob(lastAttemptAt, issueNumber, now());
    }
  }

  return { schedule, publishNow, publishCandidate, stop };
}
