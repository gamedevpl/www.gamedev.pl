import path from 'node:path';
import { build, transform } from 'esbuild';
import {
  CATALOG_ORIENTATIONS,
  MAX_MULTIPLAYER_SLOTS,
  CATALOG_TOUCH_VALUES as CONTRACT_CATALOG_TOUCH_VALUES,
  type CatalogEditor,
  type CatalogEntry,
  type CatalogMedia,
  type CatalogMultiplayer,
  type CatalogOrientation,
  type CatalogSaves,
  type CatalogScreenshot,
  type CatalogSensing,
  type CatalogWorld,
} from '@gamedevpl/contract';
import { rememberBounded } from '../platform/bounded-map.js';
import { classifyTouchSource, type CatalogGameTouch } from './catalog-touch.js';
import {
  DELIVERY_FIXED_FILES,
  GAME_KIT_MODULES,
  GAME_KIT_VERTICAL_ENTRIES,
  IMAGES_CONTRACT,
  MAX_SOURCE_GRAPH_MODULES,
  MUSIC_CONTRACT,
  SOURCE_GRAPH_BUDGET_BYTES,
  type GameKitModuleName,
} from '../platform/games-repo-contract.js';
import {
  assertImageFileSize,
  imageLoaderBootJs,
  imageLoaderHtml,
  mimeForImagePath,
  parseGameImages,
  type ImageManifest,
} from './raster-assets.js';
import { isRateLimitResponse } from '../platform/github-rate-limit.js';
import {
  generateIndexHtml,
  hasPlayableHowToPlay,
  type GameManifest as IndexHtmlManifest,
} from './index-html-generator.js';
import { mergeMusicTrackMaps, parseGameMusicTracks, parseMusicCatalogTracks } from './music-tracks.js';
import { generateStyleCss, type Theme } from '../platform/theme-css-generator.js';

export type { CatalogGameTouch } from './catalog-touch.js';

interface CreateIssueInput {
  title: string;
  body: string;
  labels: string[];
}

export interface PullRequestCommit {
  /** First line of the commit message — a human-readable step in the build. */
  message: string;
  /** ISO-8601 timestamp the commit was authored. */
  committedDate: string;
}

export interface PullRequestComment {
  /** Raw comment body. Untrusted text — sanitize before it reaches a creator. */
  body: string;
  /** ISO-8601 timestamp the comment was posted. */
  createdAt: string;
}

export interface WorkflowRun {
  id: number;
  // Synthetic for agent runs; CI paths differ.
  path: string;
  status: string;
  headBranch?: string;
  createdAt?: string;
}

// Statuses meaning the run still burns time.
export const IN_FLIGHT_RUN_STATUSES = ['queued', 'in_progress', 'requested', 'waiting', 'pending'];

export interface LinkedPullRequest {
  number: number;
  state: 'OPEN' | 'CLOSED' | 'MERGED';
  merged: boolean;
  isDraft: boolean;
  titleHasWip: boolean;
  /** Head branch name — used to fetch the game sources for an unmerged preview. */
  headRefName: string;
  changedFiles: string[];
  /**
   * Head commit SHA of the PR. Used to detect when the agent has pushed new work
   * so the live preview can refresh. Optional so lightweight test fixtures can omit it.
   */
  headRefOid?: string;
  /** Raw PR body — mined for the agent's task checklist. Untrusted text. */
  body?: string;
  /** Recent commits, oldest→newest, as a running build log. Untrusted text. */
  commits?: PullRequestCommit[];
  /**
   * Recent PR conversation comments, oldest→newest. Mined for the creator's own
   * change requests (relayed here by POST .../feedback) so the status page can
   * show them back — otherwise a creator has no record that their revision landed.
   */
  comments?: PullRequestComment[];
  /**
   * Rollup of CI on the head commit. The only signal we have that a build is in
   * trouble rather than merely slow, so the status page can say so instead of
   * showing a silent, stalled log.
   */
  checksState?: 'SUCCESS' | 'FAILURE' | 'PENDING' | null;
}

// Per-phase cost of one getGameSources call, for logging.
export interface GameSourcesTimings {
  totalMs: number;
  // Engine + game file reads run before compilation can start (network-bound).
  baseReadMs: number;
  // GameKit module compile/transform for this game's declared modules.
  kitModulesMs: number;
  // Sound asset resolution — synth .wav then the sourced .mp3 fallback.
  audioMs: number;
  // Music catalog + track selection. 0 when the game declares no music.
  musicMs: number;
  // core.ts transform plus the game's own esbuild graph.
  bundleMs: number;
}

/** A game's sources, assembled with its selected shared engine modules. */
export interface GameSources {
  // Shipped index.html, or generated from GAME.json howToPlay
  indexHtml: string;
  gameJs: string;
  styleCss: string;
  /** SPEC.md frontmatter title, when present. */
  title: string | null;
  // Absent from every mock implementation; only the real client fills this in.
  timings?: GameSourcesTimings;
}

export interface GetGameSourcesOptions {
  /**
   * When true, game files and TypeScript modules must come from overrides; missing files
   * return null rather than falling back to games/<slug> on the ref.
   */
  noRefFallback?: boolean;
}

// Generation lives here so every assembly path gets it for free.

// Null when the manifest cannot stand in: unparseable, or no goal/hint.
function generateIndexHtmlFromManifest(manifestSource: string, title: string): string | null {
  let manifest: IndexHtmlManifest;
  try {
    manifest = JSON.parse(manifestSource) as IndexHtmlManifest;
  } catch {
    return null;
  }
  if (!hasPlayableHowToPlay(manifest.howToPlay)) return null;
  return generateIndexHtml(manifest, { title });
}

// Null only when the manifest itself is unparseable.
function generateStyleCssFromManifest(manifestSource: string): string | null {
  let manifest: { theme?: Theme };
  try {
    manifest = JSON.parse(manifestSource) as { theme?: Theme };
  } catch {
    return null;
  }
  return generateStyleCss(manifest.theme);
}

// GAME_KIT_MODULES lives in games-repo-contract.ts — CI re-checks the live
// games repo copy when GAMES_REPO_TOKEN is set (issue #247).
/** Alias of {@link SOURCE_GRAPH_BUDGET_BYTES} — keep the local name at the call sites. */
const MAX_SOURCE_GRAPH_BYTES = SOURCE_GRAPH_BUDGET_BYTES;
/**
 * Where a module's entry source lives when it is not `shared/modules/<name>.ts`.
 * The map itself is contract, so it lives with the rest of the games-repo contract
 * and CI compares it against the games repo's own `GAME_KIT_VERTICALS`.
 */
const GAME_KIT_MODULE_ENTRIES = GAME_KIT_VERTICAL_ENTRIES;

/**
 * Maps a relative import specifier onto a `.ts` source path.
 *
 * The games repo authors TypeScript the way TypeScript ESM projects do: an import
 * may write `./foo.ts`, `./foo.js` (emit path — source is still `foo.ts`), or `./foo`.
 * The play-time bundler has to accept all three or every modular game 502s while the
 * games repo's own assemble (which resolves the same way) stays green.
 *
 * Returns null when the specifier is not a relative TypeScript module path.
 */
/** What `getGameFile` will read. Declarations and manifests, never source or media. */
const GAME_FILE_READS = new Set(['GAME.json', 'SPEC.md', 'EDITOR.json']);

export function resolveGameTypeScriptPath(resolveDir: string, specifier: string): string | null {
  if (!specifier.startsWith('./') && !specifier.startsWith('../')) {
    return null;
  }
  const resolvedPath = path.posix.resolve(resolveDir, specifier);
  if (resolvedPath.endsWith('.ts')) {
    return resolvedPath;
  }
  if (resolvedPath.endsWith('.js')) {
    return `${resolvedPath.slice(0, -'.js'.length)}.ts`;
  }
  // Extensionless — only accept bare paths (no other extension). `./foo.json` stays rejected.
  if (path.posix.extname(resolvedPath) !== '') {
    return null;
  }
  return `${resolvedPath}.ts`;
}

interface GameManifest {
  engine?: { modules?: unknown };
  audio?: { sounds?: unknown; music?: unknown; musicTracks?: unknown };
  images?: unknown;
}

interface SourcedAudioCatalog {
  sounds?: Record<string, { mime?: unknown }>;
}

interface ParsedGameManifest {
  modules: GameKitModuleName[];
  sounds: string[];
  /**
   * Selected BGM track id from GAME.json (`audio.music` string). Null when the
   * audio module is off. Matches games-repo `tools/lib/assemble.ts`.
   */
  music: string | null;
  /**
   * Extra BGM ids from GAME.json (`audio.musicTracks`), embedded alongside `music` so a
   * game can change score mid-round without a fetch. Empty for almost every game.
   */
  musicTracks: string[];
  /** GAME.json `images` name → path; empty when the game ships no rasters. */
  images: ImageManifest;
}

function isKebabCaseName(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(value);
}

function parseGameManifest(source: string): ParsedGameManifest {
  const manifest = JSON.parse(source) as GameManifest;
  const modules = manifest.engine?.modules;
  if (
    !Array.isArray(modules) ||
    modules.some(
      (moduleName) =>
        typeof moduleName !== 'string' || !GAME_KIT_MODULES.some((allowedModule) => allowedModule === moduleName),
    )
  ) {
    throw new Error('game manifest contains invalid engine modules');
  }

  const expectedOrder = GAME_KIT_MODULES.filter((moduleName) => modules.includes(moduleName));
  if (new Set(modules).size !== modules.length || modules.join(',') !== expectedOrder.join(',')) {
    throw new Error('game manifest engine modules are duplicated or out of order');
  }

  const images = parseGameImages(manifest.images);

  if (!modules.includes('audio')) {
    return { modules: modules as GameKitModuleName[], sounds: [], music: null, musicTracks: [], images };
  }

  const sounds = manifest.audio?.sounds;
  if (
    !Array.isArray(sounds) ||
    sounds.length === 0 ||
    new Set(sounds).size !== sounds.length ||
    !sounds.every(isKebabCaseName)
  ) {
    throw new Error('game manifest contains invalid audio sounds');
  }

  // Games-repo assemble: `audio.music` is a single track name string. Injected as
  // `window.__GAME_AUDIO_MUSIC__ = "<name>"`, and it is the track that autoplays.
  const music = manifest.audio?.music;
  if (!isKebabCaseName(music)) {
    throw new Error('game manifest contains invalid audio music');
  }

  // `audio.musicTracks` is optional. Mirrors games-repo validate Check 3: non-empty when
  // present, kebab-case names, no duplicates, and never a repeat of `audio.music`.
  const rawTracks = manifest.audio?.musicTracks;
  let musicTracks: string[] = [];
  if (rawTracks !== undefined) {
    if (
      !Array.isArray(rawTracks) ||
      rawTracks.length === 0 ||
      new Set(rawTracks).size !== rawTracks.length ||
      !rawTracks.every(isKebabCaseName) ||
      rawTracks.includes(music)
    ) {
      throw new Error('game manifest contains invalid audio musicTracks');
    }
    musicTracks = rawTracks;
  }

  return { modules: modules as GameKitModuleName[], sounds, music, musicTracks, images };
}

/**
 * Shared music catalog (`shared/audio/music.json`). The games-repo assembler only
 * reads the `tracks` map — each value is the playback descriptor for one BGM id.
 */
function parseMusicTracks(source: string): Record<string, unknown> {
  return parseMusicCatalogTracks(source);
}

export type CatalogGameOrientation = CatalogOrientation;
export type CatalogMediaScreenshot = CatalogScreenshot;
export type CatalogGameMedia = CatalogMedia;
export type CatalogGameMultiplayer = CatalogMultiplayer;
export type CatalogGameEntry = CatalogEntry;

export type CatalogGameSaves = CatalogSaves;
export type CatalogGameWorld = CatalogWorld;
export type CatalogGameSensing = CatalogSensing;
export type CatalogGameEditor = CatalogEditor;

/**
 * `player` is the only mode that exists. Anything else — a typo, a value from a newer
 * games repo — degrades to null rather than failing the catalog, matching how malformed
 * multiplayer metadata degrades a game to single-player.
 */
function parseSaves(value: unknown): CatalogGameSaves | null {
  return value === 'player' ? 'player' : null;
}

function parseWorld(value: unknown): CatalogGameWorld | null {
  return value === 'shared' ? 'shared' : null;
}

function parseSensing(value: unknown): CatalogGameSensing | null {
  return value === 'tilt' || value === 'backdrop' ? value : null;
}

function parseEditor(value: unknown): CatalogGameEditor | null {
  return value === 'content' ? 'content' : null;
}

/** Platform ceiling on player slots — mirrors SLOT_COLORS in mp.ts. */

/**
 * Reads the multiplayer keys out of a game's frontmatter. Frontmatter is a flat
 * key:value map (nested YAML is rejected by both parsers), so the fields are
 * flat and snake_case like `submitted_by`. Anything malformed degrades the game
 * to single-player rather than failing the catalog.
 */
function parseMultiplayer(frontmatter: Record<string, string>): CatalogGameMultiplayer | null {
  if (frontmatter.multiplayer !== 'controllers') {
    return null;
  }
  const minPlayers = Number.parseInt(frontmatter.min_players ?? '', 10);
  const maxPlayers = Number.parseInt(frontmatter.max_players ?? '', 10);
  if (!Number.isInteger(minPlayers) || !Number.isInteger(maxPlayers)) {
    return null;
  }
  if (minPlayers < 2 || maxPlayers < minPlayers || maxPlayers > MAX_MULTIPLAYER_SLOTS) {
    return null;
  }
  return { mode: 'controllers', minPlayers, maxPlayers };
}

const GAME_ORIENTATIONS = new Set<CatalogGameOrientation>(CATALOG_ORIENTATIONS);

/**
 * Anything unrecognised degrades to 'any' rather than failing the catalog: an
 * orientation typo should not take a playable game off the site. The games
 * repo's own validate (Check 13) is what holds authors to the valid set.
 */
function parseOrientation(frontmatter: Record<string, string>): CatalogGameOrientation {
  const value = (frontmatter.orientation ?? '').trim().toLowerCase() as CatalogGameOrientation;
  return GAME_ORIENTATIONS.has(value) ? value : 'any';
}

/** Ceiling matches the creator display-name cap on submissions. */
const SUBMITTED_BY_MAX = 40;

/**
 * `submitted_by: null` is the YAML for "no human creator"; parsers that stringify
 * frontmatter hand us the literal "null". Empty / missing / tilde mean the same.
 * Anything else is shown as a byline — length-capped, never interpreted as code.
 */
export function parseSubmittedBy(raw: string | undefined | null): string | null {
  if (raw === undefined || raw === null) return null;
  const value = raw.trim();
  if (!value || value === 'null' || value === '~') return null;
  return value.slice(0, SUBMITTED_BY_MAX);
}

export interface GitHubClient {
  createIssue(input: CreateIssueInput): Promise<{ number: number }>;
  getIssueState(issueNumber: number): Promise<{ state: 'open' | 'closed' }>;
  findLinkedPR(issueNumber: number): Promise<LinkedPullRequest | null>;
  /**
   * Posts a comment on an issue or pull request. GitHub's REST comments endpoint is
   * shared — a PR's conversation is addressed by its number as an "issue" — so one
   * method covers both. Used to relay creator feedback so the coding agent iterates
   * on its open PR.
   */
  createIssueComment(issueOrPrNumber: number, body: string): Promise<{ id: number }>;
  /**
   * Rewrites an issue body. Used once, right after creation, to add the build-channel
   * credentials — they are derived from the issue number, which GitHub only assigns
   * when the issue already exists.
   */
  updateIssueBody(issueNumber: number, body: string): Promise<void>;
  /**
   * Closes an issue (a creator abandoning their build) or an open pull request.
   * The REST issues endpoint covers both — a PR is an issue for state purposes —
   * but PRs are closed through the pulls endpoint so GitHub records it as such.
   */
  closeIssue(issueNumber: number): Promise<void>;
  closePullRequest(pullNumber: number): Promise<void>;
  /**
   * Opens a pull request for an existing branch, or returns the open one if there
   * already is one.
   *
   * Exists for one narrow reason: GitHub's agent tasks API can only resume work on a
   * branch that has an **open pull request** — without one, the `head_ref` asking it to
   * resume is silently ignored and the agent branches fresh instead. So a revision round
   * has to guarantee the PR exists first. The PR is never merged and nothing reads it;
   * it is resumption context, and the adapter closes it when the job finishes.
   */
  ensureOpenPullRequest(input: { headRef: string; baseRef: string; title: string; body: string }): Promise<{
    number: number;
  }>;
  /**
   * Deletes a build's working branch. Best effort by contract — the caller treats a
   * failure as litter rather than an error, because the game itself was never in the
   * branch: it is in the store, which is what makes the branch disposable at all.
   */
  deleteBranch(ref: string): Promise<void>;
  // Runs on `branch`, newest first.
  listWorkflowRuns(input: { branch: string; perPage?: number }): Promise<WorkflowRun[]>;
  // Accepted asynchronously; needs `actions: write`.
  cancelWorkflowRun(runId: number): Promise<void>;
  /**
   * Creates a branch off `baseRef` carrying `files`, in one commit.
   *
   * The only write into the games repo that is not a person or a coding agent, and it
   * exists for exactly one caller: a seeded build, whose round 0 has to be *in* the
   * workspace before the agent starts. Copilot's dispatch takes a branch to start from,
   * so putting the seed on a branch is how a generated draft becomes a starting point
   * rather than a suggestion the agent may or may not read.
   *
   * One commit, via the git data API, rather than a file-at-a-time contents write: four
   * requests (resolve base, tree, commit, ref) regardless of how many files a draft has,
   * because the tree takes file contents inline instead of a blob upload each. The branch
   * also never exists in a half-written state that a dispatch could race.
   *
   * The caller owns the branch's lifetime and deletes it (`deleteBranch`) — nothing here
   * is merged, ever, and the games repo is not where the game ends up.
   */
  createBranchWithFiles(input: {
    branch: string;
    baseRef: string;
    message: string;
    files: { path: string; content: string }[];
  }): Promise<{ branch: string; sha: string }>;
  /**
   * Reads a game's source files from a branch (typically an unmerged PR head).
   * Returns null if the game directory or a required file is missing on that ref.
   */
  /**
   * Assemble a game's playable sources.
   *
   * `overrides` replaces individual game-relative TypeScript files (e.g.
   * `game/runtime.ts`) with in-memory text instead of what the ref holds. It is
   * how the remix code lane rebuilds a game around one edited region without
   * forking the assembler: the engine, CSP, provenance marking, credential scan
   * and byte caps all stay exactly where serve policy is owned. Only paths
   * inside the game directory are consultable — an override for anything else is
   * never looked at, because the bundler only ever asks for game-root paths.
   */
  getGameSources(
    ref: string,
    slug: string,
    overrides?: Record<string, string>,
    options?: GetGameSourcesOptions,
  ): Promise<GameSources | null>;
  /**
   * One declared file out of a game's directory, or null when it is not there.
   *
   * Exists because "does this game exist, and what does it declare?" should not
   * cost a full assembly. `getGameSources` fetches the engine, every module,
   * every audio asset and then bundles — minutes of work in bytes for a question
   * two reads answer. Errors are *not* swallowed: a 403 or a rate limit must not
   * be indistinguishable from a missing file, which is exactly the confusion
   * that made every remix answer "game not found".
   */
  getGameFile(ref: string, slug: string, path: string): Promise<string | null>;
  /**
   * Every TypeScript source a game actually uses, keyed by its game-relative
   * path — the game's own code, never the engine's.
   *
   * The set comes from the bundler's own walk of the import graph rather than
   * from a directory listing, which makes it exactly the files that end up in
   * the running game: a stale module nobody imports is not part of the game and
   * should not be offered to an editor as if it were. The same caps that bound
   * an assembly bound this, because it *is* an assembly — the output is thrown
   * away and only the sources are kept.
   *
   * Exists so a repo-era game can be edited at all. A store-era game hands over
   * its files at publish; a repo-era one keeps them on the ref, and without this
   * the whole catalog could only be tuned through declared parameters.
   */
  getGameSourceMap(ref: string, slug: string): Promise<Record<string, string> | null>;
  /**
   * Full deliverable source set for a repo-era game: the TS import graph plus
   * every fixed delivery file that exists on the ref (`SPEC.md`, `index.html`,
   * …). Used to fork a remix into a Studio draft when the session never held a
   * store copy — the code-lane map alone is not enough to pass
   * `putCandidateSources` (preview still requires SPEC + index + game.ts).
   *
   * Null when the game has no entry point (same absence as {@link getGameSourceMap}).
   * A missing optional fixed file is omitted rather than failing the whole set.
   */
  getGameDeliverySources(ref: string, slug: string): Promise<Record<string, string> | null>;
  /**
   * `shared/game-kit.d.ts` — the ambient declaration every game is written
   * against.
   *
   * Not part of any game's sources (it is ambient, and the bundler never loads
   * it), but it is what a game's code actually has to satisfy, so the code lane
   * needs it twice over: to show the editing call what `GameKit` really offers
   * instead of letting it guess, and to type-check the result. Cached per ref
   * because it changes only when the engine does, and both uses are on the
   * player's critical path.
   */
  getGameKitDeclaration(ref: string): Promise<string | null>;
  /**
   * Reads the agent's own progress journal for a game on `ref`
   * (`games/<slug>/PROGRESS.md`). This is how the coding agent narrates what it is
   * doing in words a creator understands, instead of us inferring it from commit
   * subjects. Returns null when the agent hasn't written one.
   */
  getProgressNotes(ref: string, slug: string): Promise<string | null>;
  /**
   * Reads a website-ready screenshot or gameplay video from a published game's
   * media directory. Callers must still validate the filename against catalog
   * metadata before exposing the bytes.
   */
  getGameMedia(ref: string, slug: string, filename: string): Promise<Uint8Array | null>;
  /**
   * Reads a game's media manifest on any ref, so an in-progress build's own captures
   * can be shown from its branch. The published catalog answers this for merged games;
   * an unmerged branch has no catalog entry, and its media is exactly what a creator
   * watching that build wants to see.
   */
  getGameMediaManifest(ref: string, slug: string): Promise<CatalogGameMedia | null>;
  /**
   * Builds the game catalog for `ref`. Prefer, in order:
   * 1. Derive from an archive file source (`listPaths`) — used by the snapshot
   *    bake; includes code-derived `touch` and does not need a committed
   *    `catalog.json` in the games repo.
   * 2. A legacy committed `catalog.json` (older SHAs / non-archive callers).
   * 3. GraphQL SPEC + media fan-out (no `touch`).
   * Games with a missing or unparseable SPEC.md are skipped.
   */
  getCatalog(ref: string): Promise<CatalogGameEntry[]>;
  /**
   * One game's raw GAME.json, parsed but not interpreted. Null when the game does not
   * exist or its manifest is not JSON.
   *
   * Read per slug and on demand rather than folded into `getCatalog`, deliberately. The
   * only caller is the shared-world route, which needs the `world` field spec — a
   * nested object, so it cannot live in SPEC.md's flat frontmatter where the rest of a
   * game's metadata does. Adding a manifest read to the catalog build would put another
   * file fetch on every game on every refresh, and that fan-out has already caused one
   * rate-limit outage. Worlds are rare; their manifests are fetched when asked for.
   */
  getGameManifest(ref: string, slug: string): Promise<Record<string, unknown> | null>;
  /**
   * The commit a ref currently points at. Null when the ref does not resolve, or when
   * GitHub could not be asked at all.
   *
   * Exists so the health sweep (game-health.ts) can answer "has the engine moved since
   * we last checked this game" by comparing shas rather than guessing from elapsed time.
   * A sha comparison makes a quiet week cost nothing and a real engine change trigger
   * exactly the re-checks it should; a timer would re-gate the whole shelf on a schedule
   * whether or not anything changed. Null on failure rather than a throw, because the
   * caller's correct response to "we don't know where the engine is" is to start nothing.
   */
  getRefSha(ref: string): Promise<string | null>;
}

/**
 * Where this client reads repo files from. The default is GitHub's contents API,
 * one request per file; the snapshot bake supplies an archive downloaded once
 * (`fetchGamesRepoArchive`) instead, which is the same files at 1/1000th the
 * request count. Reads that are not plain file reads — GraphQL, issues, PRs —
 * always go to the API.
 *
 * `listPaths` is present on archive sources and lets `getCatalog` derive the
 * website catalog (including code-derived `touch`) without a committed
 * `catalog.json` in the games repo.
 */
export interface RepoFileSource {
  readText(path: string, ref: string): Promise<string | null>;
  readBytes(path: string, ref: string): Promise<Uint8Array | null>;
  listPaths?(): string[];
}

export interface GitHubClientOptions {
  token: string;
  repo: string;
  fetchImpl?: typeof fetch;
  files?: RepoFileSource;
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

function parseRepo(repo: string): { owner: string; name: string } {
  const [owner, name] = repo.split('/');
  if (!owner || !name) {
    throw new Error(`invalid GAMES_REPO "${repo}"`);
  }
  return { owner, name };
}

// Game-source assembly still fans out into several Contents-API reads per game;
// catalog used to do the same per game (× N games) and that stampede is what
// tripped GitHub's secondary rate limit. Catalog now batches through GraphQL
// (see getCatalog). The gate still matters for source assembly, media, and the
// few remaining REST calls — capping concurrency and backing off on a rate-limit
// response turns a burst into slower-but-working instead of a cascading outage.
const MAX_CONCURRENT_GITHUB_REQUESTS = 6;
const MAX_RATE_LIMIT_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 300;
// A GitHub-supplied Retry-After longer than this would just eat the request's own
// timeout budget — better to fail fast than hold the connection open pointlessly.
const MAX_RETRY_AFTER_MS = 4000;
// How many games' SPEC.md + media metadata to pull in one GraphQL query. Large
// enough that ~80 games fit in a handful of round-trips; small enough to stay
// well under GitHub's query complexity / payload ceilings.
const CATALOG_GRAPHQL_CHUNK_SIZE = 30;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** FIFO counting semaphore bounding how many GitHub requests are in flight at once. */
function createRequestGate(limit: number) {
  let active = 0;
  const waiters: Array<() => void> = [];
  return {
    async acquire(): Promise<void> {
      if (active < limit) {
        active += 1;
        return;
      }
      await new Promise<void>((resolve) => waiters.push(resolve));
      active += 1;
    },
    release(): void {
      active -= 1;
      waiters.shift()?.();
    },
  };
}

/** How much of GitHub's error body is worth keeping. Its messages are one sentence. */
const MAX_ERROR_BODY_CHARS = 300;

/**
 * A failed GitHub request, with GitHub's own account of why.
 *
 * Every failure here used to read `github request failed with status 403`, and a 403 from
 * this API is at least three different problems: a permission the token does not have, a
 * primary rate limit, a secondary rate limit. Telling them apart took an afternoon of
 * reading Cloud Logging against a disassembled stack trace, for a fact GitHub had put in
 * the response body all along.
 *
 * The token is never part of this — not the value, not the header. What is kept is the
 * path, GitHub's `message`, the permission the endpoint says it wanted, and the rate-limit
 * headers, which together answer "whose fault, and will it clear on its own".
 */
export class GitHubRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details: {
      /** Request path only — no query, no host, and never a credential. */
      path: string;
      /** GitHub's own `message` field, when the body carried one. */
      githubMessage?: string;
      /** `x-accepted-github-permissions`, e.g. `contents=write` — what the token needed. */
      acceptedPermissions?: string;
      rateLimitRemaining?: string;
      retryAfter?: string;
    },
  ) {
    super(message);
    this.name = 'GitHubRequestError';
  }
}

/**
 * Builds the error for a failed response, reading its body once.
 *
 * A body that cannot be read (already consumed, not JSON, connection cut) costs the
 * explanation, never the error: the throw still carries the status, which is what the
 * old message had on its own.
 */
async function failureFrom(url: string, response: Response, label: string): Promise<GitHubRequestError> {
  let githubMessage: string | undefined;
  try {
    const text = (await response.text()).slice(0, MAX_ERROR_BODY_CHARS);
    if (text) {
      const parsed: unknown = JSON.parse(text);
      const fromJson = (parsed as { message?: unknown } | null)?.message;
      githubMessage = typeof fromJson === 'string' ? fromJson : text;
    }
  } catch {
    /* non-JSON or unreadable body — the status still stands on its own */
  }

  let path = url;
  try {
    path = new URL(url).pathname;
  } catch {
    /* not absolute; the raw string is still more useful than nothing */
  }

  const details = {
    path,
    ...(githubMessage ? { githubMessage } : {}),
    ...(response.headers.get('x-accepted-github-permissions')
      ? { acceptedPermissions: response.headers.get('x-accepted-github-permissions') as string }
      : {}),
    ...(response.headers.get('x-ratelimit-remaining')
      ? { rateLimitRemaining: response.headers.get('x-ratelimit-remaining') as string }
      : {}),
    ...(response.headers.get('retry-after') ? { retryAfter: response.headers.get('retry-after') as string } : {}),
  };

  // Everything goes in the message, not only in `details`: pino's error serializer keeps
  // `message`, `name` and `stack` and drops the rest, so a field nobody reads is a field
  // that is not there. The throttle markers are named because they are the difference
  // between "this will clear by itself" and "someone has to change a permission".
  const suffix = [
    githubMessage ? `: ${githubMessage}` : '',
    details.acceptedPermissions ? ` (needs ${details.acceptedPermissions})` : '',
    details.rateLimitRemaining === '0' ? ' [rate limit exhausted]' : '',
    details.retryAfter ? ` [retry-after ${details.retryAfter}]` : '',
  ].join('');
  return new GitHubRequestError(
    `${label} failed with status ${response.status} for ${path}${suffix}`,
    response.status,
    details,
  );
}

export function createGitHubClient(options: GitHubClientOptions): GitHubClient {
  const { token, repo } = options;
  // Whether this token may read `statusCheckRollup`. Assumed yes, flipped off for the
  // life of the process the first time GitHub rejects it (see findLinkedPR).
  let checksFieldUsable = true;
  const fetchImpl = options.fetchImpl ?? fetch;
  const { owner, name } = parseRepo(repo);
  const requestGate = createRequestGate(MAX_CONCURRENT_GITHUB_REQUESTS);

  /** Queues behind the concurrency gate and retries a rate-limited response with backoff. */
  async function githubFetch(url: string, init: RequestInit): Promise<Response> {
    await requestGate.acquire();
    try {
      for (let attempt = 0; ; attempt += 1) {
        const response = await fetchImpl(url, init);
        if (!isRateLimitResponse(response) || attempt >= MAX_RATE_LIMIT_RETRIES) {
          return response;
        }
        const retryAfterHeader = Number(response.headers.get('retry-after'));
        const retryAfterMs = Number.isFinite(retryAfterHeader) && retryAfterHeader > 0 ? retryAfterHeader * 1000 : NaN;
        const delayMs = Number.isFinite(retryAfterMs) ? retryAfterMs : RETRY_BASE_DELAY_MS * 2 ** attempt;
        if (delayMs > MAX_RETRY_AFTER_MS) {
          return response;
        }
        await sleep(delayMs + Math.random() * 100);
      }
    } finally {
      requestGate.release();
    }
  }

  /** Reads a file as text from the contents API; null when it doesn't exist on `ref`. */
  async function readRawFileFromApi(path: string, ref: string): Promise<string | null> {
    const url = `https://api.github.com/repos/${repo}/contents/${path}?ref=${encodeURIComponent(ref)}`;
    const response = await githubFetch(url, {
      headers: {
        // Ask for the raw file bytes rather than the base64 JSON envelope.
        Accept: 'application/vnd.github.raw',
        Authorization: ['Bearer', token].join(' '),
      },
    });
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw await failureFrom(url, response, 'github contents request');
    }
    return response.text();
  }

  async function readRawBytesFromApi(path: string, ref: string): Promise<Uint8Array | null> {
    const url = `https://api.github.com/repos/${repo}/contents/${path}?ref=${encodeURIComponent(ref)}`;
    const response = await githubFetch(url, {
      headers: {
        Accept: 'application/vnd.github.raw',
        Authorization: ['Bearer', token].join(' '),
      },
    });
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw await failureFrom(url, response, 'github contents request');
    }
    return new Uint8Array(await response.arrayBuffer());
  }

  // One seam for every file read in this client. The bake swaps in an archive
  // (`games-repo-archive.ts`) so a whole snapshot costs one download instead of a
  // read per file, and every line of assembly below stays the same either way.
  const readRawFile = options.files ? options.files.readText : readRawFileFromApi;
  // Kit declaration cached per resolved SHA, not the mutable ref.
  const gameKitBySha = new Map<string, string | null>();
  const readRawBytes = options.files ? options.files.readBytes : readRawBytesFromApi;

  async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await githubFetch(url, {
      ...init,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: ['Bearer', token].join(' '),
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });
    if (!response.ok) {
      throw await failureFrom(url, response, 'github request');
    }
    // A successful write need not answer with a document. `DELETE /git/refs` returns 204
    // No Content, and parsing that empty body threw `Unexpected end of JSON input` — so
    // every branch delete that *worked* was reported to its caller as a failure. The one
    // caller logs and continues, which is why "could not delete a spent build workspace"
    // has been appearing above branches that were, in fact, deleted.
    if (response.status === 204 || response.status === 202 || response.headers.get('content-length') === '0') {
      return undefined as T;
    }
    return (await response.json()) as T;
  }

  const SHARED_SIM_ROOT = '/shared/sim';

  async function bundleTypeScriptGraph(
    entrySource: string,
    ref: string,
    sourceRoot: string,
    entryPath: string,
    sourceKind: 'game' | 'GameKit module',
    overrides?: Record<string, string>,
    /** When given, every module the walk loads is recorded here by root-relative path. */
    collect?: Map<string, string>,
    options?: GetGameSourcesOptions,
  ): Promise<string> {
    const loadedPaths = new Set([entryPath]);
    let sourceBytes = Buffer.byteLength(entrySource, 'utf8');
    if (sourceBytes > MAX_SOURCE_GRAPH_BYTES) {
      throw new Error(`${sourceKind} TypeScript exceeds ${MAX_SOURCE_GRAPH_BYTES} bytes`);
    }

    const result = await build({
      stdin: {
        contents: entrySource,
        loader: 'ts',
        resolveDir: sourceRoot,
        sourcefile: entryPath,
      },
      bundle: true,
      write: false,
      platform: 'browser',
      target: 'es2022',
      format: 'iife',
      legalComments: 'inline',
      plugins: [
        {
          name: 'github-typescript-modules',
          setup(builder) {
            builder.onResolve({ filter: /^\./ }, (args) => {
              // Games-repo TypeScript follows normal ESM habits: relative imports may
              // carry a `.ts` suffix, a `.js` suffix (TypeScript's Node ESM convention
              // — the source file is still `.ts`), or no suffix at all. Map all three
              // onto a path under the source root before the sandbox check; anything
              // that escapes that root is rejected.
              const sourcePath = resolveGameTypeScriptPath(args.resolveDir, args.path);
              const isAllowed =
                sourcePath &&
                (sourcePath.startsWith(`${sourceRoot}/`) ||
                  (sourceKind === 'game' && sourcePath.startsWith(`${SHARED_SIM_ROOT}/`)));
              if (!isAllowed) {
                return {
                  errors: [{ text: `${sourceKind} imports must be TypeScript files inside ${sourceRoot}` }],
                };
              }
              return { path: sourcePath, namespace: 'github-typescript-source' };
            });
            builder.onResolve({ filter: /^[^.]/ }, (args) => ({
              errors: [{ text: `${sourceKind} runtime dependency is forbidden: "${args.path}"` }],
            }));
            builder.onLoad({ filter: /.*/, namespace: 'github-typescript-source' }, async (args) => {
              // Prefer the resolved file; if an extensionless import pointed at a
              // directory, fall back to its index.ts (same rule TypeScript uses).
              // Count the *actual* source path once — not the synthetic `dir.ts`
              // plus `dir/index.ts` — so directory imports don't burn two slots
              // toward MAX_SOURCE_GRAPH_MODULES.
              let loadedPath = args.path;
              // An override shadows the ref's copy of the same file. Keyed by the
              // root-relative path, which is what a source edit names.
              const overrideOf = (absolutePath: string): string | null => {
                if (!overrides || !absolutePath.startsWith(`${sourceRoot}/`)) return null;
                const relative = absolutePath.slice(sourceRoot.length + 1);
                return Object.hasOwn(overrides, relative) ? overrides[relative] : null;
              };
              let source =
                overrideOf(loadedPath) ?? (options?.noRefFallback ? null : await readRawFile(loadedPath.slice(1), ref));
              if (source === null && loadedPath.endsWith('.ts')) {
                const indexPath = `${loadedPath.slice(0, -'.ts'.length)}/index.ts`;
                const isAllowedIndex =
                  indexPath.startsWith(`${sourceRoot}/`) ||
                  (sourceKind === 'game' && indexPath.startsWith(`${SHARED_SIM_ROOT}/`));
                if (isAllowedIndex) {
                  const indexSource =
                    overrideOf(indexPath) ??
                    (options?.noRefFallback ? null : await readRawFile(indexPath.slice(1), ref));
                  if (indexSource !== null) {
                    loadedPath = indexPath;
                    source = indexSource;
                  }
                }
              }
              if (source === null) {
                return { errors: [{ text: `${sourceKind} module not found: ${args.path}` }] };
              }
              if (loadedPath.startsWith(`${sourceRoot}/`)) {
                collect?.set(loadedPath.slice(sourceRoot.length + 1), source);
              }
              if (!loadedPaths.has(loadedPath)) {
                if (loadedPaths.size >= MAX_SOURCE_GRAPH_MODULES) {
                  return {
                    errors: [{ text: `${sourceKind} exceeds ${MAX_SOURCE_GRAPH_MODULES} TypeScript modules` }],
                  };
                }
                loadedPaths.add(loadedPath);
                sourceBytes += Buffer.byteLength(source, 'utf8');
                if (sourceBytes > MAX_SOURCE_GRAPH_BYTES) {
                  return { errors: [{ text: `${sourceKind} TypeScript exceeds ${MAX_SOURCE_GRAPH_BYTES} bytes` }] };
                }
              }
              return {
                contents: source,
                loader: 'ts',
                resolveDir: path.posix.dirname(loadedPath),
              };
            });
          },
        },
      ],
    });
    const output = result.outputFiles?.[0];
    if (!output) {
      throw new Error(`${sourceKind} TypeScript bundler produced no output`);
    }
    return output.text;
  }

  function bundleGameTypeScript(
    entrySource: string,
    ref: string,
    slug: string,
    overrides?: Record<string, string>,
    collect?: Map<string, string>,
    options?: GetGameSourcesOptions,
  ): Promise<string> {
    const gameRoot = `/games/${slug}`;
    return bundleTypeScriptGraph(
      entrySource,
      ref,
      gameRoot,
      `${gameRoot}/game.ts`,
      'game',
      overrides,
      collect,
      options,
    );
  }

  // Resolves a branch, tag, or SHA to the commit SHA it names.
  async function resolveRefSha(ref: string): Promise<string | null> {
    // Same charset guard the catalog read uses, plus no `..`: the ref lands in a URL
    // path, and a slashed ref like `release/1.x` must stay slashed to resolve — so it
    // cannot be escaped away, and traversal has to be refused outright instead.
    if (!/^[A-Za-z0-9._/-]+$/.test(ref) || ref.split('/').includes('..')) return null;
    try {
      // The commits endpoint rather than git/refs: it resolves a branch, a tag and a
      // sha alike, so the caller is not obliged to know which kind of ref it holds.
      const commit = await requestJson<{ sha?: string }>(`https://api.github.com/repos/${repo}/commits/${ref}`);
      return typeof commit.sha === 'string' && commit.sha ? commit.sha : null;
    } catch {
      return null;
    }
  }

  // Warm SHAs kept at once: mirrors kit-files.ts's KIT_TREE_CACHE_CAPACITY.
  const ENGINE_CACHE_CAPACITY = 2;
  // Short TTL — a branch's SHA can move.
  const REF_SHA_CACHE_TTL_MS = 60_000;
  const refShaCache = new Map<string, { sha: string; expiresAt: number }>();

  // A failed resolution falls back to the raw ref.
  async function resolveEngineSha(ref: string): Promise<string> {
    const cached = refShaCache.get(ref);
    const now = Date.now();
    if (cached && cached.expiresAt > now) return cached.sha;
    const sha = (await resolveRefSha(ref)) ?? ref;
    rememberBounded(refShaCache, ref, { sha, expiresAt: now + REF_SHA_CACHE_TTL_MS }, 64);
    return sha;
  }

  // Engine half of getGameSources, cached per SHA, shared by every game.
  const gameShellCssBySha = new Map<string, string | null>();
  const coreJsBySha = new Map<string, string>();
  const kitModuleBySha = new Map<string, string | null>();

  // A miss reads through `sha`, never the mutable `ref`.
  async function getCachedGameShellCss(sha: string): Promise<string | null> {
    if (gameShellCssBySha.has(sha)) return gameShellCssBySha.get(sha)!;
    const value = await readRawFile('shared/game-shell.css', sha);
    rememberBounded(gameShellCssBySha, sha, value, ENGINE_CACHE_CAPACITY);
    return value;
  }

  async function getCachedCoreJs(sha: string): Promise<string | null> {
    const cached = coreJsBySha.get(sha);
    if (cached !== undefined) return cached;
    const coreTs = await readRawFile('shared/modules/core.ts', sha);
    if (coreTs === null) return null;
    const result = await transform(coreTs, { loader: 'ts', target: 'es2022', format: 'iife', legalComments: 'inline' });
    rememberBounded(coreJsBySha, sha, result.code, ENGINE_CACHE_CAPACITY);
    return result.code;
  }

  async function getCachedGameKitModule(sha: string, moduleName: GameKitModuleName): Promise<string | null> {
    const cacheKey = `${sha}:${moduleName}`;
    if (kitModuleBySha.has(cacheKey)) return kitModuleBySha.get(cacheKey)!;
    const value = await compileGameKitModule(moduleName, sha);
    rememberBounded(kitModuleBySha, cacheKey, value, ENGINE_CACHE_CAPACITY * GAME_KIT_MODULES.length);
    return value;
  }

  async function compileGameKitModule(moduleName: GameKitModuleName, ref: string): Promise<string | null> {
    const entryPath = GAME_KIT_MODULE_ENTRIES[moduleName] ?? `shared/modules/${moduleName}.ts`;
    const source = await readRawFile(entryPath, ref);
    if (source === null) return null;
    if (GAME_KIT_MODULE_ENTRIES[moduleName]) {
      return bundleTypeScriptGraph(source, ref, `/${path.posix.dirname(entryPath)}`, `/${entryPath}`, 'GameKit module');
    }
    const result = await transform(source, {
      loader: 'ts',
      target: 'es2022',
      format: 'iife',
      legalComments: 'inline',
    });
    return result.code;
  }

  return {
    async createIssue(input) {
      const result = await requestJson<{ number: number }>(`https://api.github.com/repos/${repo}/issues`, {
        method: 'POST',
        body: JSON.stringify(input),
      });
      return { number: result.number };
    },

    async getIssueState(issueNumber) {
      const result = await requestJson<{ state: 'open' | 'closed' }>(
        `https://api.github.com/repos/${repo}/issues/${issueNumber}`,
      );
      return { state: result.state };
    },

    async createIssueComment(issueOrPrNumber, body) {
      const result = await requestJson<{ id: number }>(
        `https://api.github.com/repos/${repo}/issues/${issueOrPrNumber}/comments`,
        { method: 'POST', body: JSON.stringify({ body }) },
      );
      return { id: result.id };
    },

    async updateIssueBody(issueNumber, body) {
      await requestJson(`https://api.github.com/repos/${repo}/issues/${issueNumber}`, {
        method: 'PATCH',
        body: JSON.stringify({ body }),
      });
    },

    async ensureOpenPullRequest(input) {
      const existing = await requestJson<Array<{ number: number }>>(
        `https://api.github.com/repos/${repo}/pulls?state=open&head=${encodeURIComponent(
          `${owner}:${input.headRef}`,
        )}&base=${encodeURIComponent(input.baseRef)}`,
      );
      if (existing.length > 0) return { number: existing[0].number };

      const created = await requestJson<{ number: number }>(`https://api.github.com/repos/${repo}/pulls`, {
        method: 'POST',
        body: JSON.stringify({ head: input.headRef, base: input.baseRef, title: input.title, body: input.body }),
      });
      return { number: created.number };
    },

    async deleteBranch(ref) {
      await requestJson(`https://api.github.com/repos/${repo}/git/refs/heads/${encodeURIComponent(ref)}`, {
        method: 'DELETE',
      });
    },

    async listWorkflowRuns(input) {
      const params = new URLSearchParams({
        branch: input.branch,
        per_page: String(input.perPage ?? 30),
      });
      const payload = await requestJson<{ workflow_runs?: Array<Record<string, unknown>> }>(
        `https://api.github.com/repos/${repo}/actions/runs?${params.toString()}`,
      );
      const runs = Array.isArray(payload?.workflow_runs) ? payload.workflow_runs : [];
      return runs.map((run) => ({
        id: Number(run.id),
        path: typeof run.path === 'string' ? run.path : '',
        status: typeof run.status === 'string' ? run.status : '',
        ...(typeof run.head_branch === 'string' ? { headBranch: run.head_branch } : {}),
        ...(typeof run.created_at === 'string' ? { createdAt: run.created_at } : {}),
      }));
    },

    async cancelWorkflowRun(runId) {
      await requestJson(`https://api.github.com/repos/${repo}/actions/runs/${runId}/cancel`, { method: 'POST' });
    },

    async createBranchWithFiles(input) {
      // Resolve through the commits endpoint like getRefSha does: it accepts a branch, a
      // tag or a sha alike, so a pinned harness ref works whichever kind it is.
      const base = await requestJson<{ sha?: string; commit?: { tree?: { sha?: string } } }>(
        `https://api.github.com/repos/${repo}/commits/${encodeURIComponent(input.baseRef)}`,
      );
      const baseSha = base.sha;
      const baseTreeSha = base.commit?.tree?.sha;
      if (!baseSha || !baseTreeSha) {
        throw new Error(`cannot resolve base ref "${input.baseRef}"`);
      }

      // Inline `content` rather than pre-creating a blob per file: the tree API accepts
      // the bytes directly, so a ten-file draft is one request instead of eleven.
      const tree = await requestJson<{ sha?: string }>(`https://api.github.com/repos/${repo}/git/trees`, {
        method: 'POST',
        body: JSON.stringify({
          base_tree: baseTreeSha,
          tree: input.files.map((file) => ({
            path: file.path,
            mode: '100644',
            type: 'blob',
            content: file.content,
          })),
        }),
      });
      if (!tree.sha) throw new Error('git tree creation returned no sha');

      const commit = await requestJson<{ sha?: string }>(`https://api.github.com/repos/${repo}/git/commits`, {
        method: 'POST',
        body: JSON.stringify({ message: input.message, tree: tree.sha, parents: [baseSha] }),
      });
      if (!commit.sha) throw new Error('git commit creation returned no sha');

      await requestJson(`https://api.github.com/repos/${repo}/git/refs`, {
        method: 'POST',
        body: JSON.stringify({ ref: `refs/heads/${input.branch}`, sha: commit.sha }),
      });

      return { branch: input.branch, sha: commit.sha };
    },

    async closeIssue(issueNumber) {
      await requestJson(`https://api.github.com/repos/${repo}/issues/${issueNumber}`, {
        method: 'PATCH',
        body: JSON.stringify({ state: 'closed' }),
      });
    },

    async closePullRequest(pullNumber) {
      await requestJson(`https://api.github.com/repos/${repo}/pulls/${pullNumber}`, {
        method: 'PATCH',
        body: JSON.stringify({ state: 'closed' }),
      });
    },

    async findLinkedPR(issueNumber) {
      const runLinkedPrQuery = async (withChecks: boolean) =>
        await requestJson<
          GraphQLResponse<{
            repository: {
              issue: {
                timelineItems: {
                  nodes: Array<{
                    source: {
                      __typename: 'PullRequest';
                      number: number;
                      state: 'OPEN' | 'CLOSED' | 'MERGED';
                      merged: boolean;
                      isDraft: boolean;
                      title: string;
                      body: string;
                      headRefName: string;
                      headRefOid: string;
                      files: { nodes: Array<{ path: string }> };
                      commits: {
                        nodes: Array<{
                          commit: {
                            messageHeadline: string;
                            committedDate: string;
                            statusCheckRollup?: { state: string } | null;
                          };
                        }>;
                      };
                      comments: {
                        nodes: Array<{ body: string; createdAt: string }>;
                      };
                    } | null;
                  }>;
                };
              } | null;
            };
          }>
        >('https://api.github.com/graphql', {
          method: 'POST',
          body: JSON.stringify({
            query: `
            query LinkedPullRequest($owner: String!, $name: String!, $issueNumber: Int!) {
              repository(owner: $owner, name: $name) {
                issue(number: $issueNumber) {
                  timelineItems(first: 50, itemTypes: [CROSS_REFERENCED_EVENT]) {
                    nodes {
                      ... on CrossReferencedEvent {
                        source {
                          __typename
                          ... on PullRequest {
                            number
                            state
                            merged
                            isDraft
                            title
                            body
                            headRefName
                            headRefOid
                            files(first: 100) {
                              nodes {
                                path
                              }
                            }
                            commits(last: 20) {
                              nodes {
                                commit {
                                  messageHeadline
                                  committedDate
                                  ${withChecks ? 'statusCheckRollup { state }' : ''}
                                }
                              }
                            }
                            comments(last: 30) {
                              nodes {
                                body
                                createdAt
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          `,
            variables: { owner, name, issueNumber },
          }),
        });

      let response = await runLinkedPrQuery(checksFieldUsable);

      // The CI rollup needs a token permission the status page must never depend on:
      // without it GitHub fails the *whole* query, which would take the status page
      // down with it. Drop the field and retry — once per process, then stop asking.
      if (checksFieldUsable && response.errors?.length && !response.data?.repository?.issue) {
        checksFieldUsable = false;
        response = await runLinkedPrQuery(false);
      }

      // Field-level errors (a forbidden or null sub-field) come back alongside usable
      // data — only a response with no data at all is a real failure.
      if (response.errors?.length && !response.data?.repository) {
        throw new Error(response.errors[0]?.message ?? 'github graphql request failed');
      }

      const pullRequestNode = response.data?.repository.issue?.timelineItems.nodes
        .map((node) => node.source)
        .find((source) => source?.__typename === 'PullRequest');

      if (!pullRequestNode || pullRequestNode.__typename !== 'PullRequest') {
        return null;
      }

      return {
        number: pullRequestNode.number,
        state: pullRequestNode.state,
        merged: pullRequestNode.merged,
        isDraft: pullRequestNode.isDraft,
        titleHasWip: /^\[WIP\]/i.test(pullRequestNode.title),
        headRefName: pullRequestNode.headRefName,
        headRefOid: pullRequestNode.headRefOid,
        body: pullRequestNode.body ?? '',
        // Populated for every linked PR (the files connection is already queried):
        // merged PRs use it to resolve the published slug, open PRs to locate the
        // game directory for an unmerged preview.
        changedFiles: pullRequestNode.files.nodes.map((node) => node.path),
        commits: pullRequestNode.commits.nodes.map((node) => ({
          message: node.commit.messageHeadline,
          committedDate: node.commit.committedDate,
        })),
        // Rollup of the head commit only — that's the run that reflects the code a
        // creator is about to play. Anything other than the three states we act on
        // (e.g. EXPECTED, ERROR) is treated as "no signal".
        checksState: (() => {
          const state = pullRequestNode.commits.nodes.at(-1)?.commit.statusCheckRollup?.state;
          return state === 'SUCCESS' || state === 'FAILURE' || state === 'PENDING' ? state : null;
        })(),
        comments: (pullRequestNode.comments?.nodes ?? []).map((node) => ({
          body: node.body ?? '',
          createdAt: node.createdAt,
        })),
      };
    },

    async getProgressNotes(ref, slug) {
      if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
        return null;
      }
      const raw = await readRawFile(`games/${slug}/PROGRESS.md`, ref);
      // Cap the read: this is agent-authored and only its newest lines are shown.
      return raw === null ? null : raw.slice(0, 4096);
    },

    async getGameSourceMap(ref, slug) {
      if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) return null;
      const entry = await readRawFile(`games/${slug}/game.ts`, ref);
      // No entry point is the only absence this reports. Everything else — a read
      // that fails, a bundle that will not build — *throws*, because the first
      // version of this swallowed both into the same null and the caller turned
      // that null into "this game cannot be remixed that deeply yet". A game with
      // an entry point and a broken pipeline then looked exactly like a game we
      // had chosen not to support, which is the same laundering that made every
      // remix answer "game not found" (see the note on `getGameFile`).
      if (entry === null) return null;
      const collected = new Map<string, string>([['game.ts', entry]]);
      // The bundle output is discarded — this runs the walk for its trail. Doing
      // it any other way (a directory listing, a hand-rolled import parser)
      // would be a second, quietly different answer to "what is this game made
      // of", and the two would drift the first time an import convention moved.
      await bundleGameTypeScript(entry, ref, slug, undefined, collected);
      return Object.fromEntries(collected);
    },

    async getGameDeliverySources(ref, slug) {
      const modules = await this.getGameSourceMap(ref, slug);
      if (!modules) return null;
      // Fixed files the store delivery contract accepts. Read in parallel; absent
      // ones (TRACE on a preview-only fork, AGENT on an older game) are skipped.
      // game.ts is already in `modules` from the walk — re-reading it is fine and
      // keeps this list identical to DELIVERY_FIXED_FILES rather than a fork of it.
      const fixedEntries = await Promise.all(
        DELIVERY_FIXED_FILES.map(async (relative) => {
          const content = await readRawFile(`games/${slug}/${relative}`, ref);
          return content === null ? null : ([relative, content] as const);
        }),
      );
      const sources: Record<string, string> = { ...modules };
      for (const entry of fixedEntries) {
        if (entry) sources[entry[0]] = entry[1];
      }
      // Every game relies on this — neither file is ever committed anymore.
      const manifestSource = sources['GAME.json'];
      if (manifestSource) {
        if (!sources['index.html']?.trim()) {
          const title = sources['SPEC.md'] ? parseSpecTitle(sources['SPEC.md']) : null;
          const generated = generateIndexHtmlFromManifest(manifestSource, title ?? slug);
          if (generated !== null) sources['index.html'] = generated;
        }
        if (!sources['style.css']?.trim()) {
          const generated = generateStyleCssFromManifest(manifestSource);
          if (generated !== null) sources['style.css'] = generated;
        }
      }
      return sources;
    },

    async getGameKitDeclaration(ref) {
      const sha = await resolveEngineSha(ref);
      const cached = gameKitBySha.get(sha);
      if (cached !== undefined) return cached;
      const source = await readRawFile('shared/game-kit.d.ts', sha);
      rememberBounded(gameKitBySha, sha, source, ENGINE_CACHE_CAPACITY);
      return source;
    },

    async getGameFile(ref, slug, path) {
      // Same slug guard as getGameSources, plus a closed file list: this reads
      // whatever a caller names, so the names are ours rather than theirs.
      if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) return null;
      if (!GAME_FILE_READS.has(path)) return null;
      return readRawFile(`games/${slug}/${path}`, ref);
    },

    async getGameSources(ref, slug, overrides, options) {
      // Only well-formed slugs address a game directory; reject anything that could
      // escape it (path traversal, nested paths) before it reaches the contents API.
      if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
        return null;
      }

      // A game file comes from `overrides` when one was supplied and from the ref
      // otherwise. That is what lets a caller assemble a game whose content lives
      // somewhere else entirely — the games store, or a remix's edited copy —
      // while the *engine* half below still comes from the pinned ref, so serve
      // policy and the kit are never the caller's to substitute.
      const gameFile = async (relative: string): Promise<string | null> => {
        if (overrides && Object.hasOwn(overrides, relative)) return overrides[relative];
        if (options?.noRefFallback) return null;
        return await readRawFile(`games/${slug}/${relative}`, ref);
      };

      const startedAt = Date.now();
      // The SHA gates the caches below and shares this game's own request.
      const [sha, indexHtml, gameTs, styleCss, specMd, manifestSource] = await Promise.all([
        resolveEngineSha(ref),
        gameFile('index.html'),
        gameFile('game.ts'),
        gameFile('style.css'),
        gameFile('SPEC.md'),
        gameFile('GAME.json'),
      ]);
      // A cache hit here skips the network entirely.
      const [gameShellCss, coreJs] = await Promise.all([getCachedGameShellCss(sha), getCachedCoreJs(sha)]);
      const baseReadMs = Date.now() - startedAt;

      if (gameTs === null || manifestSource === null || gameShellCss === null || coreJs === null) {
        return null;
      }

      const title = specMd ? parseSpecTitle(specMd) : null;

      // Empty counts as absent: staging writes the path before the content.
      const resolvedIndexHtml = indexHtml?.trim()
        ? indexHtml
        : generateIndexHtmlFromManifest(manifestSource, title ?? slug);
      if (resolvedIndexHtml === null) {
        return null;
      }

      const resolvedStyleCss = styleCss?.trim() ? styleCss : generateStyleCssFromManifest(manifestSource);
      if (resolvedStyleCss === null) {
        return null;
      }

      const manifest = parseGameManifest(manifestSource);
      const kitModulesStartedAt = Date.now();
      const moduleSources = await Promise.all(
        manifest.modules.map((moduleName) => getCachedGameKitModule(sha, moduleName)),
      );
      const kitModulesMs = Date.now() - kitModulesStartedAt;
      if (moduleSources.some((source) => source === null)) {
        return null;
      }
      const availableModuleSources = moduleSources.filter((source): source is string => source !== null);

      // Synth `.wav` first, then the sourced `.mp3` catalog as a fallback.
      let sourcedCatalogPromise: Promise<Record<string, { mime?: unknown }>> | null = null;
      const loadSourcedCatalog = (): Promise<Record<string, { mime?: unknown }>> => {
        if (sourcedCatalogPromise === null) {
          sourcedCatalogPromise = readRawFile('shared/audio/sourced.json', ref).then((source) =>
            source ? ((JSON.parse(source) as SourcedAudioCatalog).sounds ?? {}) : {},
          );
        }
        return sourcedCatalogPromise;
      };
      const resolveSoundAsset = async (soundName: string): Promise<[string, string] | null> => {
        const wavBytes = await readRawBytes(`shared/audio/assets/${soundName}.wav`, ref);
        if (wavBytes) {
          return [soundName, `data:audio/wav;base64,${Buffer.from(wavBytes).toString('base64')}`];
        }
        const sourced = await loadSourcedCatalog();
        if (!Object.hasOwn(sourced, soundName)) {
          return null;
        }
        const mp3Bytes = await readRawBytes(`shared/audio/sourced/${soundName}.mp3`, ref);
        if (!mp3Bytes) {
          return null;
        }
        const mime = typeof sourced[soundName].mime === 'string' ? (sourced[soundName].mime as string) : 'audio/mpeg';
        return [soundName, `data:${mime};base64,${Buffer.from(mp3Bytes).toString('base64')}`];
      };

      const audioStartedAt = Date.now();
      const audioAssets = await Promise.all(manifest.sounds.map(resolveSoundAsset));
      const audioMs = Date.now() - audioStartedAt;
      if (audioAssets.some((asset) => asset === null)) {
        return null;
      }

      const assets: Record<string, string> = Object.fromEntries(
        audioAssets.filter((asset): asset is [string, string] => asset !== null),
      );
      const assetChunks: string[] = [];

      // Music: shared catalog plus optional per-game music.json, then inject the
      // autoplay name plus every track this game can reach — not the whole catalog.
      // MCP / self-build agents cannot edit `shared/`, so custom scores ship beside
      // the game (MUSIC_CONTRACT.gameMusicPath) and merge here.
      const musicStartedAt = Date.now();
      if (manifest.music !== null) {
        const musicSource = await readRawFile(MUSIC_CONTRACT.catalogPath, ref);
        if (musicSource === null) {
          return null;
        }
        const catalogTracks = parseMusicTracks(musicSource);
        const gameMusicSource = await gameFile(MUSIC_CONTRACT.gameMusicPath);
        const gameTracks = gameMusicSource === null ? null : parseGameMusicTracks(gameMusicSource);
        const tracks = mergeMusicTrackMaps(catalogTracks, gameTracks);
        // `Object.hasOwn`, not `tracks[name] !== undefined`: the catalog comes from
        // JSON.parse and inherits Object.prototype, so `tracks.constructor` is a function
        // rather than undefined and passes a truthiness check. `constructor` also clears
        // the kebab-case filter above. Such a name would be accepted here and then embed
        // nothing — JSON.stringify drops a function — leaving playMusic to fail at runtime;
        // `__proto__` is worse still, since assigning it sets a prototype instead of a key
        // and the whole tracks map serializes empty. Mirrors games-repo assemble.ts.
        const selected: Record<string, unknown> = Object.create(null);
        for (const name of [manifest.music, ...manifest.musicTracks]) {
          if (!Object.hasOwn(tracks, name)) {
            throw new Error(`game manifest music track not found: ${name}`);
          }
          selected[name] = tracks[name];
        }

        // drumKit samples aren't in audio.sounds, so embed them here too.
        for (const track of Object.values(selected) as Array<{ drumKit?: { kick?: unknown; hat?: unknown } }>) {
          for (const soundName of [track.drumKit?.kick, track.drumKit?.hat]) {
            if (typeof soundName !== 'string' || Object.hasOwn(assets, soundName)) {
              continue;
            }
            const resolved = await resolveSoundAsset(soundName);
            if (resolved === null) {
              return null;
            }
            assets[resolved[0]] = resolved[1];
          }
        }

        assetChunks.push(`window.__GAME_AUDIO_MUSIC__ = ${JSON.stringify(manifest.music)};`);
        assetChunks.push(`window.__GAME_MUSIC_TRACKS__ = Object.freeze(${JSON.stringify(selected)});`);
      }
      const musicMs = Date.now() - musicStartedAt;

      if (Object.keys(assets).length > 0) {
        assetChunks.unshift(`window.__GAME_AUDIO_ASSETS__ = Object.freeze(${JSON.stringify(assets)});`);
      }

      let loaderHtml = '';
      const imageNames = Object.keys(manifest.images);
      if (imageNames.length > 0) {
        const imageAssets: Record<string, string> = {};
        for (const name of imageNames) {
          const relPath = manifest.images[name];
          const bytes = await readRawBytes(`games/${slug}/${relPath}`, ref);
          if (!bytes) {
            throw new Error(`game image "${name}" not found: ${relPath}`);
          }
          assertImageFileSize(name, bytes.byteLength);
          imageAssets[name] = `data:${mimeForImagePath(relPath)};base64,${Buffer.from(bytes).toString('base64')}`;
        }
        assetChunks.push(`window.${IMAGES_CONTRACT.windowAssetsName} = Object.freeze(${JSON.stringify(imageAssets)});`);
        assetChunks.push(imageLoaderBootJs(imageNames));
        loaderHtml = imageLoaderHtml();
      }

      const assetsJs = assetChunks.length > 0 ? `${assetChunks.join('\n')}\n` : '';
      const bundleStartedAt = Date.now();
      const transpiledSources = [coreJs, ...availableModuleSources];
      const gameJs = await bundleGameTypeScript(gameTs, ref, slug, overrides, undefined, options);
      const bundleMs = Date.now() - bundleStartedAt;
      const bundledJs = `${assetsJs}${transpiledSources.join('\n')}
Object.freeze(window.GameKit);
${gameJs}`;
      const bundledCss = `${gameShellCss}\n${resolvedStyleCss}`;

      return {
        indexHtml: `${loaderHtml}${resolvedIndexHtml}`,
        gameJs: bundledJs,
        styleCss: bundledCss,
        title,
        timings: { totalMs: Date.now() - startedAt, baseReadMs, kitModulesMs, audioMs, musicMs, bundleMs },
      };
    },

    async getGameMedia(ref, slug, filename) {
      if (!/^[a-z0-9][a-z0-9-]*$/.test(slug) || !/^[a-z0-9][a-z0-9-]*\.(?:png|mp4)$/.test(filename)) {
        return null;
      }
      return readRawBytes(`games/${slug}/media/${filename}`, ref);
    },

    async getGameMediaManifest(ref, slug) {
      if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
        return null;
      }
      return parseGameMedia(await readRawFile(`games/${slug}/media/metadata.json`, ref));
    },

    async getRefSha(ref) {
      return resolveRefSha(ref);
    },

    async getGameManifest(ref, slug) {
      // Only well-formed slugs address a game directory; anything that could escape it
      // is refused before it reaches the contents API.
      if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
        return null;
      }
      const source = await readRawFile(`games/${slug}/GAME.json`, ref);
      if (source === null) return null;
      try {
        const parsed: unknown = JSON.parse(source);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
          ? (parsed as Record<string, unknown>)
          : null;
      } catch {
        // An unparseable manifest is a games-repo bug that CI would have caught. Here
        // it must not become a 500 on a route a player is sitting in front of.
        return null;
      }
    },

    async getCatalog(ref) {
      // Refs appear inside GraphQL string literals below — keep the charset tight so
      // a misconfigured GAMES_PUBLISHED_REF cannot break out of the expression.
      if (!/^[A-Za-z0-9._/-]+$/.test(ref)) {
        throw new Error(`invalid published ref "${ref}"`);
      }

      // Snapshot bake supplies an archive with listPaths — derive there so the
      // games repo no longer has to commit catalog.json onto a protected main.
      const listPaths = options.files?.listPaths;
      if (typeof listPaths === 'function') {
        return buildCatalogFromArchive(ref, readRawFile, listPaths());
      }

      // Legacy fast path: older SHAs still carry a committed catalog.json.
      const committed = await readRawFile('catalog.json', ref);
      if (committed !== null) {
        const entries = parseCommittedCatalog(committed);
        if (entries !== null) {
          return entries;
        }
      }

      const listing = await requestJson<Array<{ name: string; type: string }>>(
        `https://api.github.com/repos/${repo}/contents/games?ref=${encodeURIComponent(ref)}`,
      );

      const slugs = listing
        .filter((entry) => entry.type === 'dir' && /^[a-z0-9][a-z0-9-]*$/.test(entry.name))
        .map((entry) => entry.name)
        .sort();

      // One Contents listing + a handful of GraphQL chunks replaces the old
      // ~2N Contents reads (SPEC.md + metadata.json per game). At ~80 games that
      // fan-out was what exhausted the shared token and 502'd catalog + drafts.
      const files = new Map<string, string | null>();
      for (let offset = 0; offset < slugs.length; offset += CATALOG_GRAPHQL_CHUNK_SIZE) {
        const chunk = slugs.slice(offset, offset + CATALOG_GRAPHQL_CHUNK_SIZE);
        const fields = chunk
          .map((slug, index) => {
            const i = offset + index;
            // slug is already restricted to [a-z0-9-] above — safe to interpolate.
            return `
              spec_${i}: object(expression: "${ref}:games/${slug}/SPEC.md") {
                ... on Blob { text }
              }
              media_${i}: object(expression: "${ref}:games/${slug}/media/metadata.json") {
                ... on Blob { text }
              }
            `;
          })
          .join('\n');

        const response = await requestJson<
          GraphQLResponse<{
            repository: Record<string, { text: string } | null> | null;
          }>
        >('https://api.github.com/graphql', {
          method: 'POST',
          body: JSON.stringify({
            query: `
              query CatalogChunk($owner: String!, $name: String!) {
                repository(owner: $owner, name: $name) {
                  ${fields}
                }
              }
            `,
            variables: { owner, name },
          }),
        });

        if (response.errors?.length) {
          throw new Error(response.errors[0]?.message ?? 'github graphql catalog request failed');
        }

        const repository = response.data?.repository;
        if (!repository) {
          throw new Error('github graphql catalog request returned no repository');
        }

        for (const [index, slug] of chunk.entries()) {
          const i = offset + index;
          files.set(`games/${slug}/SPEC.md`, repository[`spec_${i}`]?.text ?? null);
          files.set(`games/${slug}/media/metadata.json`, repository[`media_${i}`]?.text ?? null);
        }
      }

      const entries: CatalogGameEntry[] = [];
      for (const slug of slugs) {
        const specMd = files.get(`games/${slug}/SPEC.md`) ?? null;
        if (specMd === null) {
          continue;
        }
        const entry = catalogEntryFromSpec(slug, specMd, (name) => files.get(`games/${slug}/${name}`) ?? null);
        if (entry) entries.push(entry);
      }

      return entries;
    },
  };
}

const SAFE_MEDIA_NAME = /^[a-z0-9][a-z0-9-]*$/;
const SAFE_MEDIA_PNG = /^[a-z0-9][a-z0-9-]*\.png$/;
const SAFE_MEDIA_MP4 = /^[a-z0-9][a-z0-9-]*\.mp4$/;
const CATALOG_TOUCH_VALUES = new Set<CatalogGameTouch>(CONTRACT_CATALOG_TOUCH_VALUES);

/**
 * Builds the website catalog from a games-repo archive listing. Same fields as
 * the old committed catalog.json (including code-derived `touch`), but computed
 * at bake time from the tree being published — so a merge never has to push a
 * regenerated aggregate onto protected `main` first.
 */
async function buildCatalogFromArchive(
  ref: string,
  readRawFile: (path: string, ref: string) => Promise<string | null>,
  paths: readonly string[],
): Promise<CatalogGameEntry[]> {
  // One pass over the archive listing: slug set, per-slug .ts paths, path Set for
  // media existence. Avoids O(paths × games) rescans inside the per-game loop.
  const pathSet = new Set(paths);
  const slugs = new Set<string>();
  const tsPathsBySlug = new Map<string, string[]>();
  for (const filePath of paths) {
    const match = /^games\/([a-z0-9][a-z0-9-]*)\/(.+)$/.exec(filePath);
    if (!match) continue;
    const slug = match[1];
    const relative = match[2];
    if (relative === 'SPEC.md') {
      slugs.add(slug);
    }
    if (relative.endsWith('.ts')) {
      const list = tsPathsBySlug.get(slug);
      if (list) list.push(filePath);
      else tsPathsBySlug.set(slug, [filePath]);
    }
  }

  const entries: CatalogGameEntry[] = [];
  for (const slug of [...slugs].sort()) {
    const specMd = await readRawFile(`games/${slug}/SPEC.md`, ref);
    if (specMd === null) continue;

    const mediaPath = `games/${slug}/media/metadata.json`;
    const mediaJson = pathSet.has(mediaPath) ? await readRawFile(mediaPath, ref) : null;
    const entry = catalogEntryFromSpec(slug, specMd, (name) => (name === 'media/metadata.json' ? mediaJson : null));
    if (!entry) continue;

    if (entry.media) {
      const screenshots = entry.media.screenshots.filter((shot) => pathSet.has(`games/${slug}/media/${shot.file}`));
      const video =
        entry.media.video && pathSet.has(`games/${slug}/media/${entry.media.video}`) ? entry.media.video : null;
      entry.media = screenshots.length > 0 || video ? { screenshots, video } : null;
    }

    const tsPaths = tsPathsBySlug.get(slug) ?? [];
    const sources = await Promise.all(tsPaths.map((filePath) => readRawFile(filePath, ref)));
    entry.touch = classifyTouchSource(sources.filter((text): text is string => text !== null).join('\n'));

    entries.push(entry);
  }
  return entries;
}

/**
 * Parses the games repo's committed catalog.json into catalog entries. The file
 * is CI-validated at the source, but everything is still re-checked here — the
 * media filenames it vouches for become servable URLs, and this process must
 * not extend more trust to a repo file than to any other remote input.
 * Returns null when the payload is not a catalog at all (fall back to the
 * GraphQL fan-out); individual malformed entries are just skipped.
 */
function parseCommittedCatalog(raw: string): CatalogGameEntry[] | null {
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(body)) {
    return null;
  }

  const entries: CatalogGameEntry[] = [];
  for (const item of body) {
    if (typeof item !== 'object' || item === null) continue;
    const candidate = item as Record<string, unknown>;
    if (typeof candidate.slug !== 'string' || !SAFE_MEDIA_NAME.test(candidate.slug)) continue;
    if (typeof candidate.title !== 'string' || candidate.title.length === 0) continue;

    // Same status coercion as the SPEC-derived path, and a no-op for a current
    // artifact: it is SPEC.md that made `status` optional, while the generator still
    // writes one of `published`/`archived`/`disabled` onto every row. The coercion
    // stays because this also reads artifacts it did not just generate — ones written
    // before that change, carrying a `draft` the field's own repo never acted on, and
    // ones with the key absent entirely, which must publish rather than vanish.
    const rawStatus = typeof candidate.status === 'string' ? candidate.status : '';
    const status = rawStatus === 'archived' || rawStatus === 'disabled' ? rawStatus : 'published';

    const orientationRaw = typeof candidate.orientation === 'string' ? candidate.orientation.trim().toLowerCase() : '';
    const touch = candidate.touch;

    const submittedByRaw =
      typeof candidate.submittedBy === 'string'
        ? candidate.submittedBy
        : typeof candidate.submitted_by === 'string'
          ? candidate.submitted_by
          : candidate.submittedBy === null || candidate.submitted_by === null
            ? null
            : undefined;

    entries.push({
      slug: candidate.slug,
      title: candidate.title,
      genre: typeof candidate.genre === 'string' ? candidate.genre : '',
      controls: typeof candidate.controls === 'string' ? candidate.controls : '',
      status,
      media: parseCommittedMedia(candidate.media),
      multiplayer: parseCommittedMultiplayer(candidate.multiplayer),
      saves: parseSaves(candidate.saves),
      world: parseWorld(candidate.world),
      sensing: parseSensing(candidate.sensing),
      editor: parseEditor(candidate.editor),
      orientation: GAME_ORIENTATIONS.has(orientationRaw as CatalogGameOrientation)
        ? (orientationRaw as CatalogGameOrientation)
        : 'any',
      submittedBy: parseSubmittedBy(submittedByRaw),
      ...(typeof touch === 'string' && CATALOG_TOUCH_VALUES.has(touch as CatalogGameTouch)
        ? { touch: touch as CatalogGameTouch }
        : {}),
    });
  }

  // Rows present but none usable means this is not the schema we understand — a
  // field rename in the games repo, say. Serving the resulting empty array would
  // blank every game on the site; fall through to the fan-out instead. An
  // artifact that is genuinely `[]` still returns an empty catalog, as it should.
  if (body.length > 0 && entries.length === 0) {
    return null;
  }
  return entries;
}

/** The committed catalog carries media already in website shape, unlike per-game metadata.json. */
function parseCommittedMedia(value: unknown): CatalogGameMedia | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const media = value as { screenshots?: unknown; video?: unknown };
  const screenshots = (Array.isArray(media.screenshots) ? media.screenshots : [])
    .filter(
      (shot): shot is { name: string; file: string } =>
        typeof shot === 'object' &&
        shot !== null &&
        typeof (shot as { name?: unknown }).name === 'string' &&
        SAFE_MEDIA_NAME.test((shot as { name: string }).name) &&
        typeof (shot as { file?: unknown }).file === 'string' &&
        SAFE_MEDIA_PNG.test((shot as { file: string }).file),
    )
    .slice(0, 8)
    .map((shot) => ({ name: shot.name, file: shot.file }));
  const video = typeof media.video === 'string' && SAFE_MEDIA_MP4.test(media.video) ? media.video : null;
  return screenshots.length > 0 || video ? { screenshots, video } : null;
}

function parseCommittedMultiplayer(value: unknown): CatalogGameMultiplayer | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const multiplayer = value as { mode?: unknown; minPlayers?: unknown; maxPlayers?: unknown };
  if (
    multiplayer.mode !== 'controllers' ||
    typeof multiplayer.minPlayers !== 'number' ||
    typeof multiplayer.maxPlayers !== 'number' ||
    !Number.isInteger(multiplayer.minPlayers) ||
    !Number.isInteger(multiplayer.maxPlayers)
  ) {
    return null;
  }
  if (
    multiplayer.minPlayers < 2 ||
    multiplayer.maxPlayers < multiplayer.minPlayers ||
    multiplayer.maxPlayers > MAX_MULTIPLAYER_SLOTS
  ) {
    return null;
  }
  return { mode: 'controllers', minPlayers: multiplayer.minPlayers, maxPlayers: multiplayer.maxPlayers };
}

/**
 * Turns a capture harness `media/metadata.json` into the catalog's media shape.
 *
 * Exported so the store-publish path can apply the same allowlist the repo path uses
 * when serving `/api/games/:slug/media/:filename` — a second parser would be a second
 * answer to "which filenames are public".
 */
export function parseGameMedia(metadataJson: string | null): CatalogGameMedia | null {
  if (!metadataJson) {
    return null;
  }

  try {
    const metadata = JSON.parse(metadataJson) as {
      captures?: Record<string, { file?: unknown }>;
      video?: { file?: unknown };
    };
    const screenshots = Object.entries(metadata.captures ?? {})
      .filter(
        (entry): entry is [string, { file: string }] =>
          /^[a-z0-9][a-z0-9-]*$/.test(entry[0]) &&
          typeof entry[1]?.file === 'string' &&
          /^[a-z0-9][a-z0-9-]*\.png$/.test(entry[1].file),
      )
      .slice(0, 8)
      .map(([name, capture]) => ({ name, file: capture.file }));
    const video =
      typeof metadata.video?.file === 'string' && /^[a-z0-9][a-z0-9-]*\.mp4$/.test(metadata.video.file)
        ? metadata.video.file
        : null;

    return screenshots.length > 0 || video ? { screenshots, video } : null;
  } catch {
    return null;
  }
}

/**
 * Parses a game SPEC.md's YAML-ish frontmatter into a flat string map — the same
 * lenient `key: value` format the games repo's tools/lib/spec.mjs uses (no nested
 * YAML). Lines that don't look like `key: value` are skipped.
 */
/**
 * Builds one catalog entry from a game's `SPEC.md`.
 *
 * Exported because games now reach the catalog two ways — committed to the games repo,
 * or delivered to the store and published from there — and both have to describe a game
 * identically. A second implementation for the store path would be a second answer to
 * "what genre is this game", diverging silently the first time a frontmatter field is
 * added. `readSibling` is how the caller supplies files next to the spec (`media/
 * metadata.json` today), since one side has them in a tree listing and the other in a
 * bucket. Returns null for a spec with no title, which is not a game we can list.
 */
export function catalogEntryFromSpec(
  slug: string,
  specMd: string,
  readSibling: (name: string) => string | null,
): CatalogGameEntry | null {
  const frontmatter = parseSpecFrontmatter(specMd);
  const title = frontmatter.title;
  if (!title) return null;
  // A spec with no status is published — merging it is what publishes it. Only an
  // explicit archived/disabled withdraws a game from the site.
  const rawStatus = frontmatter.status ?? '';
  const status = rawStatus === 'archived' || rawStatus === 'disabled' ? rawStatus : 'published';
  const mediaMetadata = status === 'published' ? readSibling('media/metadata.json') : null;
  return {
    slug,
    title,
    genre: frontmatter.genre ?? '',
    controls: frontmatter.controls ?? '',
    status,
    media: parseGameMedia(mediaMetadata),
    multiplayer: parseMultiplayer(frontmatter),
    saves: parseSaves(frontmatter.saves),
    world: parseWorld(frontmatter.world),
    sensing: parseSensing(frontmatter.sensing),
    editor: parseEditor(frontmatter.editor),
    orientation: parseOrientation(frontmatter),
    submittedBy: parseSubmittedBy(frontmatter.submitted_by),
  };
}

function parseSpecFrontmatter(specMd: string): Record<string, string> {
  const matched = /^---\s*\n([\s\S]*?)\n---/.exec(specMd);
  if (!matched?.[1]) {
    return {};
  }

  const data: Record<string, string> = {};
  for (const line of matched[1].split(/\r?\n/)) {
    const separatorIndex = line.indexOf(':');
    if (separatorIndex === -1) {
      continue;
    }
    const key = line.slice(0, separatorIndex).trim();
    const value = line
      .slice(separatorIndex + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
    if (key) {
      data[key] = value;
    }
  }
  return data;
}

/** Extracts the `title:` value from a game's SPEC.md YAML frontmatter, if any. */
export function parseSpecTitle(specMd: string): string | null {
  return parseSpecFrontmatter(specMd).title || null;
}
