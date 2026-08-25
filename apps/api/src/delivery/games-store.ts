// The games store: Cloud Storage as the system of record for creator game content.
//
// Today the games repo is that record, and git is the medium — which is why ~200 MB of
// its history is regenerable PNG and MP4, why a takedown is not complete until a merge
// and a green bake, and why publication means "somebody merged something". None of those
// are properties anyone chose; they are properties of storing content in a repository.
//
// Here a game is a sequence of immutable versions:
//
//   games/<slug>/versions/<version>/manifest.json   provenance: job, engine ref, gate
//   games/<slug>/versions/<version>/source/<path>   SPEC.md, GAME.json, game.ts, …
//   games/<slug>/versions/<version>/media/<file>    produced by our gate, never uploaded
//   games/<slug>/versions/<version>/bundle.html     produced by our gate, never uploaded
//
// Publication is a *registry* fact rather than a storage fact — which object exists says
// nothing about what is live. That split is deliberate: it is what makes a takedown a
// flag flip plus a re-bake instead of a revert-and-wait, and what stops a stray object
// resurrecting a withdrawn game.

import type { DeliveryMode, PreflightKind } from '@gamedevpl/contract';
import { randomBytes } from 'node:crypto';
import { GoogleAuth } from 'google-auth-library';
import {
  DELIVERY_EXTRA_MODULE_PATTERN,
  DELIVERY_FIXED_FILES,
  DELIVERY_MAX_FILES,
  DELIVERY_MAX_UPLOAD_BYTES,
  DELIVERY_RESERVED_SEGMENTS,
} from '../platform/games-repo-contract.js';
import type { GateProgress, GateProgressStage } from './gate-progress.js';
import { applyGateVerdict, applyPreviewGateVerdict, applyHealthVerdict } from './version-verdict.js';
import { hasPlayableHowToPlay } from '../catalog/index-html-generator.js';
import { parseKitSidecar } from '../platform/kit-registry.js';
import { KIT_REGISTRY_OBJECT, parseKitRegistry, type KitRegistry } from '../platform/kit-window.js';
import { findUnresolvedSourceLinks, formatSourceLinkError, sourceFilesToMap } from './source-link-check.js';
import { BANNED_ANY_GUIDANCE, describeBannedAnyFinding, findBannedAnyUsages } from './ts-any-scan.js';

export type { GateProgress } from './gate-progress.js';

/**
 * Files an agent is allowed to deliver, and nothing else.
 *
 * This list is the delivery contract, and it is enforced server-side rather than trusted
 * to the agent's instructions. It is what makes "GameKit and other games are read-only"
 * structurally true instead of merely requested: there is no path an upload can name that
 * reaches `shared/`, `tools/`, or another game's directory, so a prompt-injected or
 * simply confused agent cannot widen its own scope.
 *
 * The list itself lives in `games-repo-contract.ts`, beside the other halves of the
 * cross-repo lockstep, because it is shared with the games repo's own submit tool — and
 * because keeping two literals in step by hand is what drifted three times. Change it
 * there (and read the ordering rule in that file's header before you do); enforcement
 * stays here. Media bytes are produced by our gate, never uploaded — `media/` paths are
 * refused below rather than listed.
 */
export const ALLOWED_SOURCE_FILES = DELIVERY_FIXED_FILES;

/** A game's own `.ts` modules, the one thing it may add beyond the fixed set. */
const EXTRA_SOURCE_PATTERN = DELIVERY_EXTRA_MODULE_PATTERN;

/**
 * Config-shaped or executable-config paths an externally-authored delivery must never
 * carry. Named separately from the allowlist so the rejection reason can point at the
 * offending path as a config/exec smell rather than a vague "not deliverable".
 *
 * Deliberately *not* part of the shared delivery contract: these are platform-side
 * anti-RCE controls with no games-repo counterpart. The games repo's submit tool has
 * nothing to gain from knowing them — it never sends such a path — while a game that does
 * is either confused or hostile, and either way this side must refuse it whatever the
 * shared contract says. Tightening them is a website-only change and needs no lockstep.
 */
const FORBIDDEN_DELIVERY_BASENAME =
  /^(tsconfig(\..*)?\.json|package(-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|composer\.json|\.npmrc|\.eslintrc(\..*)?|vite\.config\..+|webpack\.config\..+|rollup\.config\..+|jest\.config\..+|vitest\.config\..+)$/i;
const FORBIDDEN_DELIVERY_EXTENSION = /\.(js|mjs|cjs|jsx|tsx|sh|bash|zsh|ps1|bat|cmd|exe|bin|yml|yaml|toml|lock)$/i;

/**
 * First path segments a game may not use.
 *
 * Note these are *not* what confines an upload — that is structural and comes from two
 * other facts: every stored path is prefixed with the version's own `source/`, so no
 * upload can name an object outside the game it belongs to, and `..` is rejected by shape
 * below. A file called `shared/x.ts` would therefore land harmlessly inside the game's
 * own tree.
 *
 * They are rejected anyway because a game directory containing `shared/` or `tools/`
 * reads as though it were editing the harness, and a boundary is only useful if a human
 * reviewing a diff can see it holding. Costing an agent one clear error message is a
 * better trade than a directory listing nobody can interpret at a glance.
 */
const RESERVED_SEGMENTS = new Set<string>(DELIVERY_RESERVED_SEGMENTS);

/** Mirrors the games repo's own slug rule, so a name valid here is valid there. */
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

/**
 * Total bytes one upload may carry. Comfortably above a real game's sources (the largest
 * in the catalog is a few hundred KB of TypeScript) and far below anything that would
 * make a rogue upload interesting as a storage attack.
 */
export const MAX_UPLOAD_BYTES = DELIVERY_MAX_UPLOAD_BYTES;
/** Cap on files per delivery. Aligned with the MCP `submit_sources` schema; the
 * byte budget (`MAX_UPLOAD_BYTES`) and filename allowlist still bound abuse. */
export const MAX_UPLOAD_FILES = DELIVERY_MAX_FILES;

/**
 * TypeScript bytes one delivery may have scanned for `any`, across all its files.
 *
 * The scanner caps a single source, which bounds one parse but not one request: four
 * files just under that cap spend the whole upload allowance on synchronous parsing, on
 * the event loop, for untrusted input. This is the budget that actually bounds it, and it
 * sits above the games repo's author budget (936 KiB) so nothing the gate would accept is
 * refused here for size.
 */
const MAX_SCANNED_DELIVERY_BYTES = 1024 * 1024;

export interface SourceFile {
  path: string;
  content: string;
}

/**
 * Delivery lane. Preview is the vibe-coding loop (typecheck→smoke→build, no TRACE).
 * Publish is the sealed candidate the full gate judges for ready_for_review.
 *
 * `proposal` is a sealed candidate somebody who does not own the game delivered. It runs
 * the same full gate as a publish — the reviewer has to be able to play it — but it is
 * refused by every path that could make a version live until the game's owner adopts it,
 * at which point {@link adoptProposalVersion} rewrites the mode to `publish`. That rewrite
 * is the only way out, and it is why the guard is a stored fact rather than a lookup: a
 * publish path that forgot to consult the proposal registry would still be safe.
 */
export type { DeliveryMode } from '@gamedevpl/contract';

/**
 * Whether a version in this mode may ever be published.
 *
 * Called by every path that can make a version live. Deliberately a named predicate
 * rather than an inline `!== 'proposal'`: it is the single place the rule is stated, so a
 * fourth mode cannot be added without an answer here.
 */
export function isPublishableMode(mode: DeliveryMode | undefined): boolean {
  // Absent means a legacy manifest from before the field existed — those are publishes.
  return mode !== 'preview' && mode !== 'proposal';
}

// Preflight kinds counted by delivery metrics.
export type PreflightRefusalKind = PreflightKind;

export class InvalidUploadError extends Error {
  readonly kind?: PreflightRefusalKind;
  // Required paths the upload lacked, so a caller can offer them.
  readonly missingPaths?: readonly string[];

  constructor(message: string, kind?: PreflightRefusalKind, missingPaths?: readonly string[]) {
    super(message);
    this.name = 'InvalidUploadError';
    this.kind = kind;
    this.missingPaths = missingPaths;
  }
}

/** Staging manifest lost a race — caller should re-read and retry. */
export class StagingGenerationMismatchError extends Error {
  constructor(message = 'staging manifest generation mismatch') {
    super(message);
    this.name = 'StagingGenerationMismatchError';
  }
}

/** How many times a staging manifest write may retry after a concurrent update. */
export const MAX_STAGING_MANIFEST_RETRIES = 64;

/** Hint derived from {@link ALLOWED_SOURCE_FILES} so refusal text cannot drift from the contract. */
const ALLOWED_SOURCES_HINT = `${ALLOWED_SOURCE_FILES.join(', ')}, or your own .ts modules`;

/**
 * True when a path is config-shaped or executable-config: tsconfig*, package*.json,
 * lockfiles, workflows, shell/JS entrypoints, dotfiles. The reason always names `path`.
 */
export function forbiddenDeliveryPathReason(path: string): string | null {
  const basename = path.split('/').pop() ?? path;
  if (path.startsWith('.') || path.split('/').some((segment) => segment.startsWith('.'))) {
    return (
      `path not deliverable: ${path}. Dotfiles and hidden paths are config/executable-shaped — ` +
      `deliver only game sources (${ALLOWED_SOURCES_HINT}).`
    );
  }
  if (path === 'media' || path.startsWith('media/')) {
    return (
      `path not deliverable: ${path}. Media is produced by the platform gate, not uploaded — ` +
      'deliver game sources only.'
    );
  }
  if (FORBIDDEN_DELIVERY_BASENAME.test(basename) || FORBIDDEN_DELIVERY_EXTENSION.test(basename)) {
    return (
      `path not deliverable: ${path}. Config or executable-shaped files are refused — ` +
      `deliver only game sources (${ALLOWED_SOURCES_HINT}).`
    );
  }
  if (path.includes('.github/') || basename === 'Dockerfile' || basename === 'Makefile') {
    return `path not deliverable: ${path}. Workflow/build files are refused — deliver only game sources.`;
  }
  return null;
}

// index.html is generated, never hand-authored — see byoca-mcp SKILL.md.
export function forbiddenIndexHtmlWriteReason(path: string, content: string): string | null {
  if (path !== 'index.html' || !content.trim()) return null;
  return (
    'index.html cannot be staged or patched — it is generated from GAME.json howToPlay, never hand-authored. ' +
    'Add a valid howToPlay to GAME.json instead: at minimum howToPlay.goal and howToPlay.hint, each a ' +
    '{"en": "...", "pl": "..."} pair (both languages, both non-empty) — that is what the generator requires ' +
    'to produce a playable page; optional controls/scoring/mode add more rows. Without it, the game has no ' +
    'markup and the gate refuses it as unplayable. If an index.html from an earlier round is in the way, ' +
    'call delete_source_file("index.html").'
  );
}

/**
 * Validates one delivery path (shape + allowlist). Used by full uploads and by
 * file-by-file staging — required-set checks (SPEC.md, TRACE, …) stay on finalize.
 */
export function assertDeliverableSourcePath(rawPath: string): string {
  const path = rawPath.trim();
  // Traversal is checked before anything else and rejected by shape, not by
  // normalization: `..` never appears in a legitimate game file, so there is no reason
  // to be clever about resolving it.
  if (path.includes('..') || path.startsWith('/') || path.includes('\\') || path.includes('\0')) {
    throw new InvalidUploadError(`illegal path: ${rawPath}`);
  }

  const forbidden = forbiddenDeliveryPathReason(path);
  if (forbidden) throw new InvalidUploadError(forbidden);

  if (RESERVED_SEGMENTS.has(path.split('/')[0])) {
    throw new InvalidUploadError(
      `path not deliverable: ${path}. \`${path.split('/')[0]}\` belongs to the harness — ` +
        'GameKit, the tooling and other games are read-only context.',
    );
  }

  const allowed =
    (ALLOWED_SOURCE_FILES as readonly string[]).includes(path) ||
    (EXTRA_SOURCE_PATTERN.test(path) && !path.includes('//'));
  if (!allowed) {
    throw new InvalidUploadError(
      `path not deliverable: ${path}. Deliver only your own game's files ` +
        `(${ALLOWED_SOURCE_FILES.join(', ')}, or your own .ts modules under the game).`,
    );
  }
  return path;
}

export function validateSourceUpload(
  files: SourceFile[],
  mode: DeliveryMode = 'publish',
  traceDerivedByGate = false,
  requireCompiledEditor = false,
): SourceFile[] {
  if (files.length === 0) throw new InvalidUploadError('no files in upload');
  if (files.length > MAX_UPLOAD_FILES) {
    throw new InvalidUploadError(`too many files: ${files.length} > ${MAX_UPLOAD_FILES}`);
  }

  const seen = new Set<string>();
  let total = 0;

  for (const file of files) {
    const path = assertDeliverableSourcePath(file.path);
    if (seen.has(path)) throw new InvalidUploadError(`duplicate path: ${path}`);

    total += Buffer.byteLength(file.content, 'utf8');
    if (total > MAX_UPLOAD_BYTES) throw new InvalidUploadError(`upload too large: over ${MAX_UPLOAD_BYTES} bytes`);

    seen.add(path);
  }

  if (!seen.has('SPEC.md')) {
    throw new InvalidUploadError('SPEC.md is required — it is the spec of record for the game', undefined, ['SPEC.md']);
  }
  if (!seen.has('game.ts')) {
    throw new InvalidUploadError('game.ts is required — a game must be playable', undefined, ['game.ts']);
  }
  if (requireCompiledEditor && !seen.has('EDITOR.json')) {
    throw new InvalidUploadError(
      'EDITOR.json is required for a new game — deliver the compiled editor contract before preview or publish',
      undefined,
      ['EDITOR.json'],
    );
  }
  if (requireCompiledEditor) {
    const editorJson = files.find((file) => file.path.trim() === 'EDITOR.json');
    if (editorJson) {
      try {
        const definition = JSON.parse(editorJson.content) as { version?: unknown } | null;
        if (definition?.version === 2 && !seen.has('EDITOR.content.json')) {
          throw new InvalidUploadError(
            'EDITOR.content.json is required for an EditorKit v2 game — deliver the content document paired with EDITOR.json',
            undefined,
            ['EDITOR.content.json'],
          );
        }
      } catch (error) {
        // Malformed declarations are reported by the authoritative editor parser in
        // the gate. This preflight only enforces the structural v2 file pair.
        if (error instanceof InvalidUploadError) throw error;
      }
    }
  }
  const gameJson = files.find((file) => file.path.trim() === 'GAME.json');

  // A blank index.html is absent, same as getGameSources treats it.
  const indexHtml = files.find((file) => file.path.trim() === 'index.html');
  const hasIndexHtml = !!indexHtml?.content.trim();

  let hasHowToPlay = false;
  if (gameJson) {
    try {
      const manifest = JSON.parse(gameJson.content) as { howToPlay?: unknown };
      hasHowToPlay = hasPlayableHowToPlay(manifest.howToPlay);
    } catch {
      // Unparseable GAME.json is reported elsewhere; it cannot supply markup.
    }
  }

  if (!hasIndexHtml && !hasHowToPlay) {
    throw new InvalidUploadError(
      'GAME.json.howToPlay is required — set goal and hint to non-empty {"en":"...","pl":"..."} objects. ' +
        'The platform generates the playable page; do not author index.html because fresh writes are unsupported.',
    );
  }
  if (mode === 'preview' && gameJson) {
    try {
      const manifest = JSON.parse(gameJson.content) as {
        engine?: { modules?: unknown };
        audio?: { sounds?: unknown; music?: unknown };
      };
      if (!Array.isArray(manifest.engine?.modules)) {
        throw new InvalidUploadError(
          'GAME.json must include engine.modules as an array — copy the module selection from the Creator Kit template before preview.',
        );
      }
      const modules = manifest.engine.modules;
      const sounds = Array.isArray(manifest.audio?.sounds) ? manifest.audio.sounds : [];
      const music = typeof manifest.audio?.music === 'string' ? manifest.audio.music.trim() : '';
      // Same two rules the assembler enforces, one round trip earlier.
      if (modules.includes('audio') && (sounds.length === 0 || !music)) {
        throw new InvalidUploadError(
          `GAME.json enables audio but ${sounds.length === 0 ? 'selects no audio.sounds' : 'names no audio.music'}. ` +
            'Every legal id is listed in the Audio catalog section of the Creator Kit digest — ' +
            'reuse them as they are; the exemplar GAME.json selects ui-toggle, win and lose. ' +
            'Dropping the audio module only defers the failure: the publish gate requires it, ' +
            'with at least three sounds including ui-toggle and a music track.',
          'audio',
        );
      }
    } catch (error) {
      if (error instanceof InvalidUploadError) throw error;
    }
  }
  if (mode === 'publish') {
    // Refused here rather than stored and failed later. Without the golden the gate cannot
    // reach a verdict at all — it stops at the trace stage having proved nothing — so
    // accepting the upload would mean storing a version that is dead on arrival, and
    // telling the agent it had succeeded. It is still running at this moment and can
    // record the golden and retry; twenty minutes later it is gone.
    //
    // Preview deliveries skip this: they run `check:game --preview` (typecheck→smoke→build)
    // and only produce Studio-playable preview.html — never a publishable green.
    if (!seen.has('TRACE.json') && !traceDerivedByGate) {
      throw new InvalidUploadError(
        'TRACE.json is required for publish — the gate diffs your game against it and cannot ' +
          'verify a publishable delivery without one. Record it with `npm run trace -- <slug> --accept`, ' +
          'or deliver mode=preview first while iterating. Read what TRACE captured, then deliver again.',
      );
    }
    // Same reasoning as TRACE.json, and the same failure without it: the harness's Check
    // 26 refuses a game that does not declare its progress landmarks, so a delivery
    // missing this one is stored, reported as accepted, and then stops at validate having
    // produced no bundle at all. Told now, while the agent still exists to act on it.
    if (!seen.has('PLAYTEST.json')) {
      throw new InvalidUploadError(
        'PLAYTEST.json is required for publish — it declares the progress landmarks your CAPTURE.json ' +
          'run must reach, and the gate refuses a publishable game without one. The minimum is ' +
          '{"expectProgress": ["round-start"]}; list richer landmarks if your capture reaches them. ' +
          'Or deliver mode=preview while iterating without it.',
      );
    }
  }

  // Refuse missing cross-file symbols before the async gate.
  const normalized = files.map((file) => ({ path: file.path.trim(), content: file.content }));

  // `any` is refused here rather than at the gate, for the reason the gate refuses it at
  // all: it is the difference between a mistake the checker catches and one a player
  // does. Telling the agent now costs it one tool call; telling it at the gate costs a
  // round, and by then it has usually written more code on top of the untyped value.
  // Every file, not the first offending one: an agent that fixes what it was told about
  // and resubmits must not meet the same refusal again for the file after it.
  const MAX_LISTED_ANY_FINDINGS = 20;
  let scannedBytes = 0;
  let anyFindingCount = 0;
  const listedFindings: string[] = [];
  for (const file of normalized) {
    if (!file.path.endsWith('.ts')) continue;
    // The per-file cap inside the scanner does not bound a delivery: four files just
    // under it spend the whole 2 MiB upload allowance on synchronous parsing, on the API
    // event loop. This budget is what actually bounds the work, and it sits above the
    // games repo's own author budget (936 KiB), so every delivery the gate would accept
    // is one this still scans in full.
    scannedBytes += Buffer.byteLength(file.content, 'utf8');
    if (scannedBytes > MAX_SCANNED_DELIVERY_BYTES) {
      throw new InvalidUploadError(
        `This delivery carries more than ${MAX_SCANNED_DELIVERY_BYTES} bytes of TypeScript, which is more than ` +
          'can be checked for the `any` type in one pass. Split the work across rounds, or ' +
          'trim what the delivery carries.',
        'any-type',
      );
    }
    for (const finding of findBannedAnyUsages(file.content)) {
      anyFindingCount += 1;
      // Counted always, described only up to the cap: a crafted delivery can carry tens of
      // thousands, and every description is a string held until the message is built.
      if (listedFindings.length < MAX_LISTED_ANY_FINDINGS) {
        listedFindings.push(describeBannedAnyFinding(file.path, finding));
      }
    }
  }
  if (anyFindingCount > 0) {
    const [first, ...rest] = listedFindings;
    const hidden = anyFindingCount - listedFindings.length;
    const more =
      rest.length > 0 ? ` (and ${anyFindingCount - 1} more in this delivery's sources: ${rest.join(', ')}` : '';
    const trailer = more ? `${hidden > 0 ? `, and ${hidden} not listed` : ''})` : '';
    throw new InvalidUploadError(`${first}${more}${trailer}. ${BANNED_ANY_GUIDANCE}`, 'any-type');
  }
  const linkFindings = findUnresolvedSourceLinks(sourceFilesToMap(normalized));
  if (linkFindings.length > 0) {
    throw new InvalidUploadError(formatSourceLinkError(linkFindings), 'symbols');
  }

  // AGENT.json is allowed above but deliberately not required here yet — see the
  // ALLOWED_SOURCE_FILES note. Missing file → Check 28 on the gate, not a 400 at upload.

  return normalized;
}

/** Provenance for one stored version. Answers "where did this come from?" years later. */
export interface VersionManifest {
  slug: string;
  version: string;
  createdAt: string;
  /** The job that produced it. */
  issueNumber: number;
  // Producing round, used to reject stale verdicts.
  roundGeneration?: number;
  /** Which backend and model built it — unattributable cost is how budgets get lost. */
  backend?: string;
  model?: string;
  /**
   * The engine commit this version was built and validated against.
   *
   * Pinned rather than floating: a game that passed the gate did so against a specific
   * GameKit, and "it worked when we accepted it" has to remain checkable after the engine
   * moves on. Distinct from {@link kitEngineRef}: that is what the agent *claimed* at
   * delivery; this is what the gate *resolved* when it checked.
   */
  engineRef?: string;
  /**
   * The Creator Kit engineRef the sources were built against (from the delivery's
   * `kitEngineRef`). Compared by the gate to `kits/current.json`'s N/N−1 window.
   */
  kitEngineRef?: string;
  /**
   * How this version came to exist, when not an ordinary agent delivery.
   *
   * `'editor'` marks a content-only publish from the Creator Studio: the previous
   * version's sources with new editor content (EDITOR.json defaults + regenerated
   * `game/editor-content.ts`), no agent involved. The gate reads it to know the
   * committed TRACE.json golden predates this content and must be re-derived
   * (`npm run trace -- --accept`) before `check:game` replays it.
   *
   * `'remix'` marks a private Studio draft forked from a published game via the
   * player remix panel — sources copied (with baked editor defaults), no agent.
   * Never a catalog publication by itself; see {@link forkedFrom}.
   *
   * `'seal'` marks a green preview promoted to a publish candidate without an agent:
   * the same sources, re-delivered so the full gate judges them. It carries no
   * TRACE.json because no agent could record one — the gate derives it, the same way
   * it does for `'editor'`.
   */
  origin?: 'editor' | 'remix' | 'seal';
  /**
   * Parent game this version was forked from, when {@link origin} is `'remix'`.
   * Attribution / genealogy — not a publish path.
   */
  forkedFrom?: { slug: string; version?: string };
  /**
   * Which lane produced this version. Absent on legacy manifests (= publish).
   * Preview versions must never carry a publishable {@link gate}.green.
   */
  deliveryMode?: DeliveryMode;
  /**
   * Set when this version was delivered as a proposal against a game the deliverer does
   * not own. Provenance that outlives the proposal record: years later, "who wrote this
   * and under what proposal" is answerable from the manifest alone.
   */
  proposal?: { id: string; proposerUid: string };
  /**
   * Set when the game's owner accepted the proposal above, at which point
   * {@link VersionManifest.deliveryMode} flips from `proposal` to `publish`.
   *
   * Both fields survive the flip. `proposal` says who wrote it, `adopted` says who took
   * responsibility for it — and a published game's contributor byline is read from the
   * pair, so erasing either would erase the credit.
   */
  adopted?: { proposalId: string; byUid: string | null; at: string };
  /** Verdict of our own gate. A version without a green one is never publishable. */
  gate?: GateVerdict;
  /** Mid-gate milestone; cleared on verdict. */
  gateProgress?: GateProgress;
  /**
   * Preview-lane check (`check:game --preview`). Separate from {@link gate} so a
   * typecheck/smoke/build pass never looks publishable to reconciliation or the catalog.
   * `status: 'kit_outdated'` is preserved so agents refresh the kit instead of retrying
   * typecheck/smoke/build against an unsupported engine pin.
   */
  previewGate?: {
    green: boolean;
    ranAt: string;
    report?: string;
    status?: 'kit_outdated';
    /** First stills frame, when the preview run captured any (BY-28a). */
    screenshot?: string;
    // Stage a red run died on.
    failedStage?: GateProgressStage;
  };
  /**
   * The most recent *health* verdict: the same check re-run later against the current
   * engine, asking "does this game still work on today's GameKit".
   *
   * A separate field from `gate` on purpose. The gate verdict is provenance — "it worked
   * when we accepted it" — and a red health run overwriting it would erase the one fact
   * that justified the publication. Health is the opposite kind of record: always the
   * latest run, expected to change as the engine moves, and never consulted by
   * publishing.
   */
  health?: { green: boolean; ranAt: string; engineRef?: string; report?: string };
  sourceFiles: string[];
  /**
   * Who wrote this delivery (CE-20), derived from the staging buffer's `stagedBy` set
   * (CE-04) at the moment it delivered. `'mixed'` means the buffer held both an agent's
   * and an owner's staged files at delivery — a manual round on a game an agent had
   * already been partway through. Absent on every version delivered before this field
   * existed, and on any delivery path that does not pass it (every lane stamps it now,
   * but a legacy manifest is not backfilled). The user-visible marking this enables is
   * counsel-gated (§4); this field exists so the data is not lost waiting for that.
   */
  authorship?: 'agent' | 'owner' | 'mixed';
  summary?: string;
}

/** What the gate wrote onto a candidate — green, red, or a kit-window refusal. */
export type GateVerdict = {
  green: boolean;
  ranAt: string;
  report?: string;
  /**
   * Machine-readable outcome. Absent means ordinary green/red from `check:game`.
   * `kit_outdated` means the delivery's kitEngineRef is outside the supported window.
   */
  status?: 'kit_outdated';
  /** First capture PNG under the version prefix, when the run produced one. */
  screenshot?: string;
  /**
   * The candidate changes a committed behavioural golden — set only by the proposal lane,
   * and only beside a green verdict. A finding for whoever reviews it, never a refusal.
   */
  behaviouralDiff?: boolean;
  // Stage a red run died on; gateProgress is cleared.
  failedStage?: GateProgressStage;
};

export type PublicationState = 'published' | 'archived' | 'disabled';

/**
 * One health re-gate of a published game, requested by the operator and resolved by the
 * sweep (the gate runs remotely, writes to the manifest and exits — same read-back
 * pattern as the acceptance verdict, for the same reason).
 *
 * Kept on the publication rather than the job: the job that built this game is terminal
 * and its state machine must stay finished. Health is a property of what is *live*.
 */
export interface PublicationHealthCheck {
  /** The stored version the check ran against — current at request time. */
  version: string;
  requestedAt: string;
  /** Cloud Build's id for the run, when the trigger reported one. */
  buildId?: string;
  /** Set once the sweep reads the verdict off the manifest. */
  green?: boolean;
  verdictAt?: string;
  /** Set once a red verdict has nudged the creator, so sweep re-runs stay quiet. */
  notifiedAt?: string;
}

/**
 * What is live, decided here rather than by what exists in the bucket.
 *
 * Keeping publication out of storage is what makes withdrawal fast and total: a takedown
 * flips this and re-bakes, with no merge, no revert, and no possibility that an object
 * left behind somewhere quietly keeps serving.
 */
export interface PublicationRecord {
  slug: string;
  state: PublicationState;
  currentVersion: string;
  publishedAt: string;
  takedownAt?: string;
  takedownReason?: string;
  /** The latest health re-gate, when one has been requested. See the type's own doc. */
  healthCheck?: PublicationHealthCheck;
}

/** One path in a job's pre-delivery staging buffer (file-by-file MCP uploads). */
export type StagedSourceEntry = {
  path: string;
  bytes: number;
  deleted?: true;
  /**
   * Who wrote this staged file (CE-04). Absent means `'agent'` — the backfill rule for
   * every entry staged before this field existed, and the default for the agent
   * channel's own writes, which do not pass it explicitly.
   */
  stagedBy?: 'agent' | 'owner';
  // CE-20: tool-authored 'owner' write; authorship only, not discard.
  agentAssisted?: boolean;
};

/** Summary of a job's staging buffer — paths only, no contents. */
export type StagedSourcesSummary = {
  files: StagedSourceEntry[];
  totalBytes: number;
  maxBytes: number;
  maxFiles: number;
  updatedAt: string | null;
};

type StagingManifest = {
  slug: string;
  issueNumber: number;
  roundGeneration: number;
  updatedAt: string;
  files: StagedSourceEntry[];
  totalBytes: number;
};

export interface GamesStore {
  /** Writes a candidate version's sources. Returns the version id assigned. */
  putCandidateSources(input: {
    slug: string;
    issueNumber: number;
    // Producing round, persisted with the candidate manifest.
    roundGeneration?: number;
    files: SourceFile[];
    requireCompiledEditor?: boolean;
    backend?: string;
    model?: string;
    engineRef?: string;
    /** Creator Kit engineRef the sources were built against (BY-06). */
    kitEngineRef?: string;
    /** Content-only Studio publish, remix fork, or sealed preview — see {@link VersionManifest.origin}. */
    origin?: 'editor' | 'remix' | 'seal';
    /** Parent provenance for remix forks — see {@link VersionManifest.forkedFrom}. */
    forkedFrom?: { slug: string; version?: string };
    /** Preview skips TRACE/PLAYTEST; default publish. */
    mode?: DeliveryMode;
    /** Marks the version as somebody else's proposed change — see {@link DeliveryMode}. */
    proposal?: { id: string; proposerUid: string };
    authorship?: 'agent' | 'owner' | 'mixed';
    summary?: string;
  }): Promise<{ version: string; manifest: VersionManifest }>;
  /**
   * Flips an accepted proposal version from `proposal` to `publish` and records who
   * adopted it.
   *
   * The one door out of proposal mode, and deliberately narrow: it refuses a version that
   * is not in proposal mode (so it cannot re-stamp an ordinary delivery), and it refuses
   * one whose gate is not green (so acceptance cannot smuggle an unchecked change into the
   * publishable set). Callers still have to have established that the caller may accept —
   * this enforces the storage half of that rule, not the authorization half.
   */
  adoptProposalVersion(input: {
    slug: string;
    version: string;
    proposalId: string;
    byUid: string | null;
    at?: string;
  }): Promise<VersionManifest>;
  /**
   * Upserts one file into the job's staging buffer (does not run the gate).
   * Scoped by roundGeneration so a retired key cannot clobber a newer round's buffer.
   */
  putStagedSourceFile(input: {
    slug: string;
    issueNumber: number;
    roundGeneration: number;
    path: string;
    content: string;
    /** Who is writing this file (CE-04). Defaults to `'agent'` when omitted. */
    stagedBy?: 'agent' | 'owner';
    agentAssisted?: boolean;
  }): Promise<StagedSourcesSummary & { path: string; bytes: number }>;
  deleteStagedSourceFile(input: {
    slug: string;
    issueNumber: number;
    roundGeneration: number;
    path: string;
    stagedBy?: 'agent' | 'owner';
  }): Promise<StagedSourcesSummary & { path: string }>;
  /** Lists staged paths + byte totals (no contents). */
  listStagedSources(input: {
    slug: string;
    issueNumber: number;
    roundGeneration: number;
  }): Promise<StagedSourcesSummary>;
  /** Reads staged contents for finalize. */
  getStagedSourceFiles(input: {
    slug: string;
    issueNumber: number;
    roundGeneration: number;
  }): Promise<Array<SourceFile & { deleted?: true }>>;
  /** Reads one staged path (null when not in the buffer). Used by patch_source_file. */
  getStagedSourceFile(input: {
    slug: string;
    issueNumber: number;
    roundGeneration: number;
    path: string;
  }): Promise<string | null>;
  /** Clears the staging buffer (all paths, or a named subset). */
  clearStagedSources(input: {
    slug: string;
    issueNumber: number;
    roundGeneration: number;
    paths?: string[];
  }): Promise<{ cleared: number }>;
  getManifest(slug: string, version: string): Promise<VersionManifest | null>;
  // Fills or replaces the changelog sentence on a version.
  setVersionSummary?(slug: string, version: string, summary: string): Promise<void>;
  /**
   * Version history for one game, newest first — the manifests under
   * `games/<slug>/versions/`. Version ids are sortable timestamps (see
   * {@link defaultVersionId}), so bucket listing order *is* delivery order.
   *
   * `limit` bounds both the listing and the manifest reads: this exists for the
   * public game page's release history, which is a paged read, not an audit.
   */
  listVersions(slug: string, opts?: { limit?: number }): Promise<VersionManifest[]>;
  countVersions?(slug: string): Promise<number>;
  getSourceFile(slug: string, version: string, path: string): Promise<string | null>;
  /**
   * Records our gate's verdict against a version. Only a green one may publish.
   *
   * `engineRef` is the commit the run actually checked against, resolved from the
   * harness itself. Stamped only when the manifest carries none: deliveries do not pin
   * an engine yet, and the gate run is the first moment anything knows the concrete sha
   * a green verdict is reproducible against.
   */
  putGateResult(
    slug: string,
    version: string,
    result: {
      green: boolean;
      report?: string;
      engineRef?: string;
      status?: 'kit_outdated';
      screenshot?: string;
      /** Proposal lane only — see {@link GateVerdict.behaviouralDiff}. */
      behaviouralDiff?: boolean;
      /** Golden the gate derived itself (editor/seal lanes) — merged into sourceFiles. */
      derivedSourceFiles?: string[];
    },
  ): Promise<void>;
  /** Mid-gate milestone overwrite. */
  putGateProgress(slug: string, version: string, progress: GateProgress): Promise<void>;
  /**
   * Records a preview-lane check. Never touches {@link VersionManifest.gate} — a preview
   * pass must not make the version publishable.
   */
  putPreviewGateResult(
    slug: string,
    version: string,
    result: { green: boolean; report?: string; status?: 'kit_outdated'; screenshot?: string },
  ): Promise<void>;
  /**
   * Records a *health* verdict — the check re-run against the current engine, long
   * after acceptance. Never touches `gate` or `engineRef`: health answers "does it
   * still work", and must not rewrite the record of what was accepted.
   */
  putHealthResult(
    slug: string,
    version: string,
    result: { green: boolean; report?: string; engineRef?: string },
  ): Promise<void>;
  /** Stores an artifact the gate produced — bundle or media. Agents never write these. */
  putDerivedArtifact(slug: string, version: string, name: string, body: Buffer, contentType: string): Promise<void>;
  getDerivedArtifact(slug: string, version: string, name: string): Promise<Buffer | null>;
  /**
   * The Creator Kit support window (`kits/current.json`). Null when the registry has
   * not been published yet — callers must not invent a window from listing order.
   */
  getKitRegistry(): Promise<KitRegistry | null>;
  /**
   * The semver a given kit was packed at, from `kits/<engineRef>.json`.
   *
   * Null when the sidecar is missing, unreadable, or predates versioning — all of
   * which mean "fall back to the N/N−1 window", never "refuse".
   */
  getKitVersion(engineRef: string): Promise<string | null>;
}

export interface GcsGamesStoreOptions {
  bucket: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
  getAccessToken?: () => Promise<string>;
  /** Injectable so version ids are deterministic under test. */
  versionId?: (at: Date) => string;
}

/**
 * Version ids are timestamps, not counters.
 *
 * A counter needs a read-modify-write against a shared value, which is a race between
 * concurrent builds of the same game and a lock nobody wants to own. A timestamp sorts
 * the same way, needs no coordination, and reads correctly in a bucket listing.
 *
 * It keeps milliseconds and carries a random suffix because seconds are not unique
 * enough to be an identity. Two deliveries inside the same second — a retried upload,
 * or two builds of one game running at once — would otherwise compute the same id and
 * overwrite each other's objects. Versions are supposed to be immutable, and an id that
 * can collide makes them silently not: the loser's sources vanish under the winner's,
 * and the manifest that survives describes a mixture of both. The suffix costs nothing
 * and the timestamp still sorts.
 */
export function defaultVersionId(at: Date): string {
  const stamp = at.toISOString().replace(/[-:.]/g, '');
  return `v${stamp}-${randomBytes(3).toString('hex')}`;
}

function assertSlug(slug: string): void {
  if (!SLUG_PATTERN.test(slug)) throw new InvalidUploadError(`invalid slug: ${slug}`);
}

export function createGcsGamesStore(options: GcsGamesStoreOptions): GamesStore {
  const { bucket } = options;
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const versionId = options.versionId ?? defaultVersionId;

  let auth: GoogleAuth | null = null;
  const getAccessToken =
    options.getAccessToken ??
    (async () => {
      auth ??= new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/devstorage.read_write'] });
      const token = await auth.getAccessToken();
      if (!token) throw new Error('could not obtain a Google access token for the games store');
      return token;
    });

  async function readObject(name: string): Promise<Buffer | null> {
    const got = await readObjectWithGeneration(name);
    return got?.body ?? null;
  }

  async function readObjectWithGeneration(name: string): Promise<{ body: Buffer; generation: number } | null> {
    const url = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(name)}?alt=media`;
    const response = await fetchImpl(url, { headers: { authorization: `Bearer ${await getAccessToken()}` } });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`games store read of ${name} failed: ${response.status}`);
    const generationHeader = response.headers.get('x-goog-generation');
    const generation = generationHeader !== null ? Number(generationHeader) : 0;
    return {
      body: Buffer.from(await response.arrayBuffer()),
      generation: Number.isFinite(generation) ? generation : 0,
    };
  }

  async function writeObject(
    name: string,
    body: Buffer,
    contentType: string,
    opts?: { ifGenerationMatch?: number },
  ): Promise<void> {
    let url =
      `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(bucket)}/o` +
      `?uploadType=media&name=${encodeURIComponent(name)}`;
    if (opts?.ifGenerationMatch !== undefined) {
      url += `&ifGenerationMatch=${opts.ifGenerationMatch}`;
    }
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${await getAccessToken()}`,
        'content-type': contentType,
        // Versions are immutable, so their objects are safe to cache indefinitely —
        // which is what lets a CDN sit in front of this later without a redesign.
        'cache-control': 'public, max-age=31536000, immutable',
      },
      body: new Uint8Array(body),
    });
    if (response.status === 412) {
      throw new StagingGenerationMismatchError(`games store write of ${name} lost a race (412)`);
    }
    if (!response.ok) throw new Error(`games store write of ${name} failed: ${response.status}`);
  }

  async function deleteObject(name: string): Promise<void> {
    const url = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(name)}`;
    const response = await fetchImpl(url, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${await getAccessToken()}` },
    });
    // 404 is fine — clear is idempotent.
    if (!response.ok && response.status !== 404) {
      throw new Error(`games store delete of ${name} failed: ${response.status}`);
    }
  }

  const versionPrefix = (slug: string, version: string) => `games/${slug}/versions/${version}`;
  const stagingPrefix = (slug: string, issueNumber: number, roundGeneration: number) =>
    `games/${slug}/staging/${issueNumber}/g${roundGeneration}`;

  async function readStagingManifest(
    slug: string,
    issueNumber: number,
    roundGeneration: number,
  ): Promise<{ manifest: StagingManifest; generation: number } | null> {
    const got = await readObjectWithGeneration(`${stagingPrefix(slug, issueNumber, roundGeneration)}/manifest.json`);
    if (!got) return null;
    return {
      manifest: JSON.parse(got.body.toString('utf8')) as StagingManifest,
      generation: got.generation,
    };
  }

  function emptyStagingSummary(): StagedSourcesSummary {
    return {
      files: [],
      totalBytes: 0,
      maxBytes: MAX_UPLOAD_BYTES,
      maxFiles: MAX_UPLOAD_FILES,
      updatedAt: null,
    };
  }

  function summaryFromManifest(manifest: StagingManifest | null): StagedSourcesSummary {
    if (!manifest) return emptyStagingSummary();
    return {
      files: [...manifest.files].sort((a, b) => a.path.localeCompare(b.path)),
      totalBytes: manifest.totalBytes,
      maxBytes: MAX_UPLOAD_BYTES,
      maxFiles: MAX_UPLOAD_FILES,
      updatedAt: manifest.updatedAt,
    };
  }

  return {
    async putCandidateSources(input) {
      assertSlug(input.slug);
      const mode: DeliveryMode =
        input.mode === 'preview' ? 'preview' : input.mode === 'proposal' ? 'proposal' : 'publish';
      // A proposal is a sealed candidate — it must carry everything a publish carries,
      // because the reviewer judges a full gate run, not a compile.
      const files = validateSourceUpload(
        input.files,
        mode === 'proposal' ? 'publish' : mode,
        input.origin === 'seal',
        input.requireCompiledEditor === true,
      );
      const at = new Date(now());
      const version = versionId(at);
      const prefix = versionPrefix(input.slug, version);

      await Promise.all(
        files.map((file) =>
          writeObject(`${prefix}/source/${file.path}`, Buffer.from(file.content, 'utf8'), 'text/plain; charset=utf-8'),
        ),
      );

      const manifest: VersionManifest = {
        slug: input.slug,
        version,
        createdAt: at.toISOString(),
        issueNumber: input.issueNumber,
        ...(input.roundGeneration !== undefined ? { roundGeneration: input.roundGeneration } : {}),
        backend: input.backend,
        model: input.model,
        engineRef: input.engineRef,
        deliveryMode: mode,
        ...(input.kitEngineRef ? { kitEngineRef: input.kitEngineRef } : {}),
        ...(input.origin ? { origin: input.origin } : {}),
        ...(input.forkedFrom ? { forkedFrom: input.forkedFrom } : {}),
        ...(input.proposal ? { proposal: input.proposal } : {}),
        ...(input.authorship ? { authorship: input.authorship } : {}),
        ...(input.summary ? { summary: input.summary } : {}),
        sourceFiles: files.map((file) => file.path),
      };
      // Written last: a manifest is what makes a version real, so a run that dies
      // mid-upload leaves orphaned objects rather than a version claiming files that
      // were never stored.
      await writeObject(`${prefix}/manifest.json`, Buffer.from(JSON.stringify(manifest, null, 2)), 'application/json');

      return { version, manifest };
    },

    async putStagedSourceFile(input) {
      assertSlug(input.slug);
      const path = assertDeliverableSourcePath(input.path);
      const indexHtmlReason = forbiddenIndexHtmlWriteReason(path, input.content);
      if (indexHtmlReason) throw new InvalidUploadError(indexHtmlReason);
      const bytes = Buffer.byteLength(input.content, 'utf8');
      if (bytes > 1_000_000) {
        throw new InvalidUploadError(`file too large: ${path} is ${bytes} bytes (max 1000000 per file)`);
      }

      const prefix = stagingPrefix(input.slug, input.issueNumber, input.roundGeneration);
      // Source bytes first — orphaned sources without a manifest entry are harmless;
      // a lost race on the manifest is retried below.
      await writeObject(`${prefix}/source/${path}`, Buffer.from(input.content, 'utf8'), 'text/plain; charset=utf-8');

      for (let attempt = 0; attempt < MAX_STAGING_MANIFEST_RETRIES; attempt++) {
        const existing = await readStagingManifest(input.slug, input.issueNumber, input.roundGeneration);
        const base = existing?.manifest ?? {
          slug: input.slug,
          issueNumber: input.issueNumber,
          roundGeneration: input.roundGeneration,
          updatedAt: new Date(now()).toISOString(),
          files: [],
          totalBytes: 0,
        };
        const generation = existing?.generation ?? 0;

        const previous = base.files.find((file) => file.path === path);
        const entry: StagedSourceEntry = {
          path,
          bytes,
          stagedBy: input.stagedBy ?? 'agent',
          ...(input.agentAssisted ? { agentAssisted: true } : {}),
        };
        const nextFiles = previous
          ? base.files.map((file) => (file.path === path ? entry : file))
          : [...base.files, entry];
        if (nextFiles.length > MAX_UPLOAD_FILES) {
          throw new InvalidUploadError(`too many staged files: ${nextFiles.length} > ${MAX_UPLOAD_FILES}`);
        }
        const totalBytes = base.totalBytes - (previous?.bytes ?? 0) + bytes;
        if (totalBytes > MAX_UPLOAD_BYTES) {
          throw new InvalidUploadError(`staged upload too large: over ${MAX_UPLOAD_BYTES} bytes`);
        }

        const manifest: StagingManifest = {
          slug: input.slug,
          issueNumber: input.issueNumber,
          roundGeneration: input.roundGeneration,
          updatedAt: new Date(now()).toISOString(),
          files: nextFiles,
          totalBytes,
        };
        try {
          await writeObject(
            `${prefix}/manifest.json`,
            Buffer.from(JSON.stringify(manifest, null, 2)),
            'application/json',
            { ifGenerationMatch: generation },
          );
          return { path, bytes, ...summaryFromManifest(manifest) };
        } catch (error) {
          if (error instanceof StagingGenerationMismatchError) continue;
          throw error;
        }
      }
      throw new InvalidUploadError(
        'could not update staging manifest — too many concurrent stage_source_file calls; retry',
      );
    },

    async deleteStagedSourceFile(input) {
      assertSlug(input.slug);
      const path = assertDeliverableSourcePath(input.path);
      const prefix = stagingPrefix(input.slug, input.issueNumber, input.roundGeneration);
      await deleteObject(`${prefix}/source/${path}`).catch(() => undefined);

      for (let attempt = 0; attempt < MAX_STAGING_MANIFEST_RETRIES; attempt++) {
        const existing = await readStagingManifest(input.slug, input.issueNumber, input.roundGeneration);
        const base = existing?.manifest ?? {
          slug: input.slug,
          issueNumber: input.issueNumber,
          roundGeneration: input.roundGeneration,
          updatedAt: new Date(now()).toISOString(),
          files: [],
          totalBytes: 0,
        };
        const generation = existing?.generation ?? 0;

        const previous = base.files.find((file) => file.path === path);
        const entry: StagedSourceEntry = { path, bytes: 0, deleted: true, stagedBy: input.stagedBy ?? 'agent' };
        const nextFiles = previous
          ? base.files.map((file) => (file.path === path ? entry : file))
          : [...base.files, entry];

        const manifest: StagingManifest = {
          slug: input.slug,
          issueNumber: input.issueNumber,
          roundGeneration: input.roundGeneration,
          updatedAt: new Date(now()).toISOString(),
          files: nextFiles,
          totalBytes: base.totalBytes - (previous?.bytes ?? 0),
        };
        try {
          await writeObject(
            `${prefix}/manifest.json`,
            Buffer.from(JSON.stringify(manifest, null, 2)),
            'application/json',
            { ifGenerationMatch: generation },
          );
          return { path, ...summaryFromManifest(manifest) };
        } catch (error) {
          if (error instanceof StagingGenerationMismatchError) continue;
          throw error;
        }
      }
      throw new InvalidUploadError('could not update staging manifest — too many concurrent staging calls; retry');
    },

    async listStagedSources(input) {
      assertSlug(input.slug);
      const existing = await readStagingManifest(input.slug, input.issueNumber, input.roundGeneration);
      return summaryFromManifest(existing?.manifest ?? null);
    },

    async getStagedSourceFiles(input) {
      assertSlug(input.slug);
      const existing = await readStagingManifest(input.slug, input.issueNumber, input.roundGeneration);
      const manifest = existing?.manifest;
      if (!manifest || manifest.files.length === 0) return [];
      const prefix = stagingPrefix(input.slug, input.issueNumber, input.roundGeneration);
      const files = await Promise.all(
        manifest.files.map(async (entry) => {
          if (entry.deleted) return { path: entry.path, content: '', deleted: true as const };
          const body = await readObject(`${prefix}/source/${entry.path}`);
          if (!body) {
            throw new InvalidUploadError(
              `staged file missing: ${entry.path} — stage it again, then submit_sources with fromStaged=true`,
            );
          }
          return { path: entry.path, content: body.toString('utf8') };
        }),
      );
      return files;
    },

    async getStagedSourceFile(input) {
      assertSlug(input.slug);
      const path = assertDeliverableSourcePath(input.path);
      const existing = await readStagingManifest(input.slug, input.issueNumber, input.roundGeneration);
      if (!existing?.manifest.files.some((file) => file.path === path)) return null;
      const body = await readObject(
        `${stagingPrefix(input.slug, input.issueNumber, input.roundGeneration)}/source/${path}`,
      );
      return body ? body.toString('utf8') : null;
    },

    async clearStagedSources(input) {
      assertSlug(input.slug);
      const prefix = stagingPrefix(input.slug, input.issueNumber, input.roundGeneration);

      for (let attempt = 0; attempt < MAX_STAGING_MANIFEST_RETRIES; attempt++) {
        const existing = await readStagingManifest(input.slug, input.issueNumber, input.roundGeneration);
        if (!existing || existing.manifest.files.length === 0) return { cleared: 0 };

        const removePaths = input.paths?.length
          ? new Set(input.paths.map((path) => assertDeliverableSourcePath(path)))
          : null;
        const toClear = removePaths
          ? existing.manifest.files.filter((file) => removePaths.has(file.path))
          : existing.manifest.files;

        await Promise.all(toClear.map((file) => deleteObject(`${prefix}/source/${file.path}`)));

        if (!removePaths || toClear.length === existing.manifest.files.length) {
          await deleteObject(`${prefix}/manifest.json`);
          return { cleared: toClear.length };
        }

        const remaining = existing.manifest.files.filter((file) => !removePaths.has(file.path));
        const manifest: StagingManifest = {
          ...existing.manifest,
          updatedAt: new Date(now()).toISOString(),
          files: remaining,
          totalBytes: remaining.reduce((sum, file) => sum + file.bytes, 0),
        };
        try {
          await writeObject(
            `${prefix}/manifest.json`,
            Buffer.from(JSON.stringify(manifest, null, 2)),
            'application/json',
            { ifGenerationMatch: existing.generation },
          );
          return { cleared: toClear.length };
        } catch (error) {
          if (error instanceof StagingGenerationMismatchError) continue;
          throw error;
        }
      }
      throw new InvalidUploadError('could not clear staging manifest — too many concurrent updates; retry');
    },

    async getManifest(slug, version) {
      const body = await readObject(`${versionPrefix(slug, version)}/manifest.json`);
      return body ? (JSON.parse(body.toString('utf8')) as VersionManifest) : null;
    },

    async setVersionSummary(slug, version, summary) {
      assertSlug(slug);
      const trimmed = summary.trim();
      if (!trimmed) return;
      const prefix = versionPrefix(slug, version);
      const existing = await readObject(`${prefix}/manifest.json`);
      if (!existing) return;
      const manifest = JSON.parse(existing.toString('utf8')) as VersionManifest;
      if (manifest.summary === trimmed) return;
      manifest.summary = trimmed.slice(0, 1024);
      await writeObject(`${prefix}/manifest.json`, Buffer.from(JSON.stringify(manifest, null, 2)), 'application/json');
    },

    async getSourceFile(slug, version, path) {
      const body = await readObject(`${versionPrefix(slug, version)}/source/${path}`);
      return body ? body.toString('utf8') : null;
    },

    async listVersions(slug, opts) {
      assertSlug(slug);
      const limit = Math.max(1, Math.min(opts?.limit ?? 30, 100));
      // Delimiter listing returns the version directories as prefixes without
      // paging through every object under them — a game's versions each hold a
      // dozen-plus source files, and this call wants one manifest per version.
      const prefix = `games/${slug}/versions/`;
      const url =
        `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o` +
        `?prefix=${encodeURIComponent(prefix)}&delimiter=${encodeURIComponent('/')}&fields=prefixes`;
      const response = await fetchImpl(url, { headers: { authorization: `Bearer ${await getAccessToken()}` } });
      if (response.status === 404) return [];
      if (!response.ok) throw new Error(`games store list of ${prefix} failed: ${response.status}`);
      const listing = (await response.json()) as { prefixes?: string[] };
      const versions = (listing.prefixes ?? [])
        .map((p) => p.slice(prefix.length).replace(/\/$/, ''))
        .filter(Boolean)
        // Timestamp ids sort lexicographically; newest first is reverse order.
        .sort((a, b) => b.localeCompare(a));
      // A version directory without a manifest is an interrupted upload, not a
      // version (see putCandidateSources) — it must not appear in a history, and
      // it must not consume a limit slot either. Read in limit-sized batches so an
      // orphan-riddled prefix still costs bounded reads rather than the whole list.
      const collected: VersionManifest[] = [];
      for (let offset = 0; offset < versions.length && collected.length < limit; offset += limit) {
        const batch = await Promise.all(
          versions.slice(offset, offset + limit).map(async (version) => {
            const body = await readObject(`${versionPrefix(slug, version)}/manifest.json`);
            return body ? (JSON.parse(body.toString('utf8')) as VersionManifest) : null;
          }),
        );
        for (const manifest of batch) {
          if (manifest !== null) collected.push(manifest);
        }
      }
      return collected.slice(0, limit);
    },

    async countVersions(slug) {
      assertSlug(slug);
      const prefix = `games/${slug}/versions/`;
      const url =
        `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o` +
        `?prefix=${encodeURIComponent(prefix)}&delimiter=${encodeURIComponent('/')}&fields=prefixes`;
      const response = await fetchImpl(url, { headers: { authorization: `Bearer ${await getAccessToken()}` } });
      if (response.status === 404) return 0;
      if (!response.ok) return 0;
      const listing = (await response.json()) as { prefixes?: string[] };
      return (listing.prefixes ?? []).length;
    },

    async adoptProposalVersion(input) {
      const prefix = versionPrefix(input.slug, input.version);
      const existing = await readObject(`${prefix}/manifest.json`);
      if (!existing) throw new Error(`no manifest for ${input.slug}@${input.version}`);
      const manifest = JSON.parse(existing.toString('utf8')) as VersionManifest;
      if (manifest.deliveryMode !== 'proposal') {
        // Not idempotent-by-accident: re-stamping an already-adopted version would
        // rewrite who adopted it, and re-stamping an ordinary delivery would invent a
        // proposal that never existed. Callers retrying a partial accept re-read first.
        throw new InvalidUploadError(`${input.slug}@${input.version} is not a proposal version`);
      }
      if (!manifest.gate?.green) {
        throw new InvalidUploadError(`${input.slug}@${input.version} has no green gate verdict`);
      }
      manifest.deliveryMode = 'publish';
      manifest.adopted = {
        proposalId: input.proposalId,
        byUid: input.byUid,
        at: input.at ?? new Date(now()).toISOString(),
      };
      await writeObject(`${prefix}/manifest.json`, Buffer.from(JSON.stringify(manifest, null, 2)), 'application/json');
      return manifest;
    },

    async putGateResult(slug, version, result) {
      const prefix = versionPrefix(slug, version);
      const existing = await readObject(`${prefix}/manifest.json`);
      if (!existing) throw new Error(`no manifest for ${slug}@${version}`);
      const manifest = JSON.parse(existing.toString('utf8')) as VersionManifest;
      applyGateVerdict(manifest, result, new Date(now()).toISOString());
      // First writer wins: the ref the *first* gate run checked against is the one the
      // verdict is reproducible against, and a re-run must not quietly repin it.
      if (result.engineRef && !manifest.engineRef) manifest.engineRef = result.engineRef;
      if (result.derivedSourceFiles) {
        const known = new Set(manifest.sourceFiles);
        for (const path of result.derivedSourceFiles) {
          if (!known.has(path)) manifest.sourceFiles.push(path);
        }
      }
      await writeObject(`${prefix}/manifest.json`, Buffer.from(JSON.stringify(manifest, null, 2)), 'application/json');
    },

    async putGateProgress(slug, version, progress) {
      const prefix = versionPrefix(slug, version);
      const name = `${prefix}/manifest.json`;
      // Generation-match retries: never overwrite a concurrent verdict.
      for (let attempt = 0; attempt < MAX_STAGING_MANIFEST_RETRIES; attempt++) {
        const got = await readObjectWithGeneration(name);
        if (!got) throw new Error(`no manifest for ${slug}@${version}`);
        const manifest = JSON.parse(got.body.toString('utf8')) as VersionManifest;
        if (manifest.gate || manifest.previewGate || manifest.health) return;
        manifest.gateProgress = progress;
        try {
          await writeObject(name, Buffer.from(JSON.stringify(manifest, null, 2)), 'application/json', {
            ifGenerationMatch: got.generation,
          });
          return;
        } catch (error) {
          if (error instanceof StagingGenerationMismatchError) continue;
          throw error;
        }
      }
      // Retries exhausted — drop advisory progress if still open.
      const final = await readObject(name);
      if (!final) throw new Error(`no manifest for ${slug}@${version}`);
      const finalManifest = JSON.parse(final.toString('utf8')) as VersionManifest;
      if (finalManifest.gate || finalManifest.previewGate || finalManifest.health) return;
    },

    async putPreviewGateResult(slug, version, result) {
      const prefix = versionPrefix(slug, version);
      const existing = await readObject(`${prefix}/manifest.json`);
      if (!existing) throw new Error(`no manifest for ${slug}@${version}`);
      const manifest = JSON.parse(existing.toString('utf8')) as VersionManifest;
      applyPreviewGateVerdict(manifest, result, new Date(now()).toISOString());
      await writeObject(`${prefix}/manifest.json`, Buffer.from(JSON.stringify(manifest, null, 2)), 'application/json');
    },

    async putHealthResult(slug, version, result) {
      const prefix = versionPrefix(slug, version);
      const existing = await readObject(`${prefix}/manifest.json`);
      if (!existing) throw new Error(`no manifest for ${slug}@${version}`);
      const manifest = JSON.parse(existing.toString('utf8')) as VersionManifest;
      applyHealthVerdict(manifest, result, new Date(now()).toISOString());
      await writeObject(`${prefix}/manifest.json`, Buffer.from(JSON.stringify(manifest, null, 2)), 'application/json');
    },

    async putDerivedArtifact(slug, version, name, body, contentType) {
      await writeObject(`${versionPrefix(slug, version)}/${name}`, body, contentType);
    },

    async getDerivedArtifact(slug, version, name) {
      return readObject(`${versionPrefix(slug, version)}/${name}`);
    },

    async getKitRegistry() {
      const body = await readObject(KIT_REGISTRY_OBJECT);
      if (!body) return null;
      return parseKitRegistry(body.toString('utf8'));
    },

    async getKitVersion(engineRef) {
      // The ref reaches here from a delivery manifest, so it is interpolated into an
      // object path only after a shape check — never trust a claim to be a commit sha.
      if (!/^[A-Za-z0-9-]+$/.test(engineRef)) return null;
      const body = await readObject(`kits/${engineRef}.json`);
      if (!body) return null;
      try {
        return parseKitSidecar(body.toString('utf8')).version ?? null;
      } catch {
        return null;
      }
    },
  };
}
