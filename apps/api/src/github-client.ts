import path from 'node:path';
import { build, transform } from 'esbuild';

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

/** A game's sources, assembled with its selected shared engine modules. */
export interface GameSources {
  indexHtml: string;
  gameJs: string;
  styleCss: string;
  /** SPEC.md frontmatter title, when present. */
  title: string | null;
}

// Canonical order must match the games repo's tools/lib/assemble.ts — the two
// lists are independent copies and a mismatch silently breaks bundling
// (issue #247: a stale list 502s every published game at serve time).
const GAME_KIT_MODULES = [
  'input',
  'collision',
  'world',
  'ai',
  'gameplay',
  'drawing',
  'actors',
  'gfx',
  'effects',
  'audio',
  'party',
] as const;
const MAX_GAME_MODULES = 64;
const MAX_GAME_SOURCE_BYTES = 200 * 1024;

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
  audio?: { sounds?: unknown; music?: unknown };
}

interface ParsedGameManifest {
  modules: string[];
  sounds: string[];
  /**
   * Selected BGM track id from GAME.json (`audio.music` string). Null when the
   * audio module is off. Matches games-repo `tools/lib/assemble.ts`.
   */
  music: string | null;
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

  if (!modules.includes('audio')) {
    return { modules, sounds: [], music: null };
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
  // `window.__GAME_AUDIO_MUSIC__ = "<name>"` with only that entry from music.json.
  const music = manifest.audio?.music;
  if (!isKebabCaseName(music)) {
    throw new Error('game manifest contains invalid audio music');
  }

  return { modules, sounds, music };
}

/**
 * Shared music catalog (`shared/audio/music.json`). The games-repo assembler only
 * reads the `tracks` map — each value is the playback descriptor for one BGM id.
 */
function parseMusicTracks(source: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new Error('shared audio music catalog is not valid JSON');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('shared audio music catalog is invalid');
  }
  const tracks = (parsed as { tracks?: unknown }).tracks;
  if (!tracks || typeof tracks !== 'object' || Array.isArray(tracks)) {
    throw new Error('shared audio music catalog is missing tracks');
  }
  return tracks as Record<string, unknown>;
}

export interface CatalogMediaScreenshot {
  name: string;
  file: string;
}

export interface CatalogGameMedia {
  screenshots: CatalogMediaScreenshot[];
  video: string | null;
}

/**
 * One game's catalog entry, derived from its SPEC.md frontmatter on the default
 * branch — the same fields the games repo's own tools/catalog.mjs emits. All
 * text is agent-authored (prompt-influenced) — render escaped only.
 */
export interface CatalogGameEntry {
  slug: string;
  title: string;
  genre: string;
  controls: string;
  status: string;
  media: CatalogGameMedia | null;
  /**
   * Multiplayer capability, from the game's flat SPEC.md frontmatter
   * (`multiplayer: controllers`). null for the single-player majority —
   * the web app badges and offers "Play together" only when this is set.
   */
  multiplayer: CatalogGameMultiplayer | null;
  /**
   * The orientation the game was designed for, from `orientation:` in SPEC.md
   * frontmatter. Design intent nothing in the source can reveal, so unlike touch
   * support it is authored rather than derived. Defaults to 'any'; the player
   * uses it to nudge a phone that is held the wrong way round.
   */
  orientation: CatalogGameOrientation;
  /**
   * Touch playability class, derived from each game's *code* by the games repo's
   * own build (it runs inferTouchSupport over the sources). Nothing readable from
   * SPEC.md can reproduce it, so it is present only when the catalog came from the
   * committed catalog.json artifact — the GraphQL fallback below leaves it absent.
   */
  touch?: CatalogGameTouch;
}

export type CatalogGameTouch = 'gamekit' | 'native' | 'controllers' | 'none';

export type CatalogGameOrientation = 'any' | 'portrait' | 'landscape';

export interface CatalogGameMultiplayer {
  mode: 'controllers';
  minPlayers: number;
  maxPlayers: number;
}

/** Platform ceiling on player slots — mirrors SLOT_COLORS in mp.ts. */
const MAX_MULTIPLAYER_SLOTS = 8;

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

const GAME_ORIENTATIONS = new Set<CatalogGameOrientation>(['any', 'portrait', 'landscape']);

/**
 * Anything unrecognised degrades to 'any' rather than failing the catalog: an
 * orientation typo should not take a playable game off the site. The games
 * repo's own validate (Check 13) is what holds authors to the valid set.
 */
function parseOrientation(frontmatter: Record<string, string>): CatalogGameOrientation {
  const value = (frontmatter.orientation ?? '').trim().toLowerCase() as CatalogGameOrientation;
  return GAME_ORIENTATIONS.has(value) ? value : 'any';
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
   * Reads a game's source files from a branch (typically an unmerged PR head).
   * Returns null if the game directory or a required file is missing on that ref.
   */
  getGameSources(ref: string, slug: string): Promise<GameSources | null>;
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
   * Builds the game catalog straight from the repo: lists `games/` directories
   * on `ref`, then reads each game's SPEC.md (and media metadata) in a small
   * number of GraphQL round-trips. Replaces both the old public Pages
   * `catalog.json` and the previous per-file Contents-API fan-out, so the games
   * repo can stay private without a rate-limit storm. Games with a missing or
   * unparseable SPEC.md are skipped.
   */
  getCatalog(ref: string): Promise<CatalogGameEntry[]>;
}

export interface GitHubClientOptions {
  token: string;
  repo: string;
  fetchImpl?: typeof fetch;
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

/**
 * True for responses that indicate GitHub's rate limiting rather than a real,
 * permanent failure — a primary-limit 403 carries `x-ratelimit-remaining: 0`, a
 * secondary-limit 403 carries `Retry-After`, and 429 is always a limit. A bare 403
 * with neither header is a genuine permission problem and must not be retried.
 */
function isRateLimitResponse(response: Response): boolean {
  if (response.status === 429) return true;
  if (response.status !== 403) return false;
  return response.headers.get('retry-after') !== null || response.headers.get('x-ratelimit-remaining') === '0';
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

  /** Reads a file's raw bytes from the contents API; null when it doesn't exist on `ref`. */
  async function readRawFile(path: string, ref: string): Promise<string | null> {
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
      throw new Error(`github contents request failed with status ${response.status}`);
    }
    return response.text();
  }

  async function readRawBytes(path: string, ref: string): Promise<Uint8Array | null> {
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
      throw new Error(`github contents request failed with status ${response.status}`);
    }
    return new Uint8Array(await response.arrayBuffer());
  }

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
      throw new Error(`github request failed with status ${response.status}`);
    }
    return (await response.json()) as T;
  }

  async function bundleGameTypeScript(entrySource: string, ref: string, slug: string): Promise<string> {
    const gameRoot = `/games/${slug}`;
    const loadedPaths = new Set([`${gameRoot}/game.ts`]);
    let sourceBytes = Buffer.byteLength(entrySource, 'utf8');
    if (sourceBytes > MAX_GAME_SOURCE_BYTES) {
      throw new Error(`game TypeScript exceeds ${MAX_GAME_SOURCE_BYTES} bytes`);
    }

    const result = await build({
      stdin: {
        contents: entrySource,
        loader: 'ts',
        resolveDir: gameRoot,
        sourcefile: `${gameRoot}/game.ts`,
      },
      bundle: true,
      write: false,
      platform: 'browser',
      target: 'es2022',
      format: 'iife',
      legalComments: 'inline',
      plugins: [
        {
          name: 'github-game-modules',
          setup(builder) {
            builder.onResolve({ filter: /^\./ }, (args) => {
              // Games-repo TypeScript follows normal ESM habits: relative imports may
              // carry a `.ts` suffix, a `.js` suffix (TypeScript's Node ESM convention
              // — the source file is still `.ts`), or no suffix at all. Map all three
              // onto a path under the game directory before the sandbox check; anything
              // that escapes the game root is rejected.
              const sourcePath = resolveGameTypeScriptPath(args.resolveDir, args.path);
              if (!sourcePath || !sourcePath.startsWith(`${gameRoot}/`)) {
                return {
                  errors: [{ text: `game imports must be TypeScript files inside ${gameRoot}` }],
                };
              }
              return { path: sourcePath, namespace: 'github-game-source' };
            });
            builder.onResolve({ filter: /^[^.]/ }, (args) => ({
              errors: [{ text: `game runtime dependency is forbidden: "${args.path}"` }],
            }));
            builder.onLoad({ filter: /.*/, namespace: 'github-game-source' }, async (args) => {
              // Prefer the resolved file; if an extensionless import pointed at a
              // directory, fall back to its index.ts (same rule TypeScript uses).
              // Count the *actual* source path once — not the synthetic `dir.ts`
              // plus `dir/index.ts` — so directory imports don't burn two slots
              // toward MAX_GAME_MODULES.
              let loadedPath = args.path;
              let source = await readRawFile(loadedPath.slice(1), ref);
              if (source === null && loadedPath.endsWith('.ts')) {
                const indexPath = `${loadedPath.slice(0, -'.ts'.length)}/index.ts`;
                if (indexPath.startsWith(`${gameRoot}/`)) {
                  const indexSource = await readRawFile(indexPath.slice(1), ref);
                  if (indexSource !== null) {
                    loadedPath = indexPath;
                    source = indexSource;
                  }
                }
              }
              if (source === null) {
                return { errors: [{ text: `game module not found: ${args.path}` }] };
              }
              if (!loadedPaths.has(loadedPath)) {
                if (loadedPaths.size >= MAX_GAME_MODULES) {
                  return { errors: [{ text: `game exceeds ${MAX_GAME_MODULES} TypeScript modules` }] };
                }
                loadedPaths.add(loadedPath);
                sourceBytes += Buffer.byteLength(source, 'utf8');
                if (sourceBytes > MAX_GAME_SOURCE_BYTES) {
                  return { errors: [{ text: `game TypeScript exceeds ${MAX_GAME_SOURCE_BYTES} bytes` }] };
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
      throw new Error('game TypeScript bundler produced no output');
    }
    return output.text;
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

    async getGameSources(ref, slug) {
      // Only well-formed slugs address a game directory; reject anything that could
      // escape it (path traversal, nested paths) before it reaches the contents API.
      if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
        return null;
      }

      const [indexHtml, gameTs, styleCss, specMd, manifestSource, gameShellCss, coreTs] = await Promise.all([
        readRawFile(`games/${slug}/index.html`, ref),
        readRawFile(`games/${slug}/game.ts`, ref),
        readRawFile(`games/${slug}/style.css`, ref),
        readRawFile(`games/${slug}/SPEC.md`, ref),
        readRawFile(`games/${slug}/GAME.json`, ref),
        readRawFile('shared/game-shell.css', ref),
        readRawFile('shared/modules/core.ts', ref),
      ]);

      if (
        indexHtml === null ||
        gameTs === null ||
        styleCss === null ||
        manifestSource === null ||
        gameShellCss === null ||
        coreTs === null
      ) {
        return null;
      }

      const manifest = parseGameManifest(manifestSource);
      const moduleSources = await Promise.all(
        manifest.modules.map((moduleName) => readRawFile(`shared/modules/${moduleName}.ts`, ref)),
      );
      if (moduleSources.some((source) => source === null)) {
        return null;
      }
      const availableModuleSources = moduleSources.filter((source): source is string => source !== null);

      const audioAssets = await Promise.all(
        manifest.sounds.map(async (soundName) => {
          const bytes = await readRawBytes(`shared/audio/assets/${soundName}.wav`, ref);
          return bytes ? [soundName, `data:audio/wav;base64,${Buffer.from(bytes).toString('base64')}`] : null;
        }),
      );
      if (audioAssets.some((asset) => asset === null)) {
        return null;
      }

      const assetEntries = audioAssets.filter((asset): asset is [string, string] => asset !== null);
      const assetChunks: string[] = [];
      if (assetEntries.length > 0) {
        assetChunks.push(
          `window.__GAME_AUDIO_ASSETS__ = Object.freeze(${JSON.stringify(Object.fromEntries(assetEntries))});`,
        );
      }

      // Music: games-repo assemble reads only `tracks` from music.json, then injects
      // the selected name plus a one-entry map — not the whole catalog.
      if (manifest.music !== null) {
        const musicSource = await readRawFile('shared/audio/music.json', ref);
        if (musicSource === null) {
          return null;
        }
        const tracks = parseMusicTracks(musicSource);
        const track = tracks[manifest.music];
        if (track === undefined) {
          throw new Error(`game manifest music track not in catalog: ${manifest.music}`);
        }
        assetChunks.push(`window.__GAME_AUDIO_MUSIC__ = ${JSON.stringify(manifest.music)};`);
        assetChunks.push(
          `window.__GAME_MUSIC_TRACKS__ = Object.freeze(${JSON.stringify({ [manifest.music]: track })});`,
        );
      }

      const assetsJs = assetChunks.length > 0 ? `${assetChunks.join('\n')}\n` : '';
      const transpiledSources = await Promise.all(
        [coreTs, ...availableModuleSources].map(async (source) => {
          const result = await transform(source, {
            loader: 'ts',
            target: 'es2022',
            format: 'iife',
            legalComments: 'inline',
          });
          return result.code;
        }),
      );
      const gameJs = await bundleGameTypeScript(gameTs, ref, slug);
      const bundledJs = `${assetsJs}${transpiledSources.join('\n')}
Object.freeze(window.GameKit);
${gameJs}`;
      const bundledCss = `${gameShellCss}\n${styleCss}`;

      return {
        indexHtml,
        gameJs: bundledJs,
        styleCss: bundledCss,
        title: specMd ? parseSpecTitle(specMd) : null,
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

    async getCatalog(ref) {
      // Refs appear inside GraphQL string literals below — keep the charset tight so
      // a misconfigured GAMES_PUBLISHED_REF cannot break out of the expression.
      if (!/^[A-Za-z0-9._/-]+$/.test(ref)) {
        throw new Error(`invalid published ref "${ref}"`);
      }

      // Fast path: the games repo commits a website-ready catalog.json at its root,
      // held fresh by its own validate gate. One read answers the whole catalog, and
      // it is the only source that can carry `touch` — a value derived from each
      // game's code, which no amount of SPEC.md reading here can reproduce.
      // The GraphQL fan-out below stays as the fallback for refs without the
      // artifact (older commits, and PR branches during a build).
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
        const frontmatter = parseSpecFrontmatter(specMd);
        const title = frontmatter.title;
        if (!title) {
          continue;
        }
        // A spec with no status is published — merging it is what publishes it.
        // Only an explicit archived/disabled withdraws a game from the site.
        const rawStatus = frontmatter.status ?? '';
        const status = rawStatus === 'archived' || rawStatus === 'disabled' ? rawStatus : 'published';
        const mediaMetadata = status === 'published' ? (files.get(`games/${slug}/media/metadata.json`) ?? null) : null;
        entries.push({
          slug,
          title,
          genre: frontmatter.genre ?? '',
          controls: frontmatter.controls ?? '',
          status,
          media: parseGameMedia(mediaMetadata),
          multiplayer: parseMultiplayer(frontmatter),
          orientation: parseOrientation(frontmatter),
        });
      }

      return entries;
    },
  };
}

const SAFE_MEDIA_NAME = /^[a-z0-9][a-z0-9-]*$/;
const SAFE_MEDIA_PNG = /^[a-z0-9][a-z0-9-]*\.png$/;
const SAFE_MEDIA_MP4 = /^[a-z0-9][a-z0-9-]*\.mp4$/;
const CATALOG_TOUCH_VALUES = new Set<CatalogGameTouch>(['gamekit', 'native', 'controllers', 'none']);

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

    entries.push({
      slug: candidate.slug,
      title: candidate.title,
      genre: typeof candidate.genre === 'string' ? candidate.genre : '',
      controls: typeof candidate.controls === 'string' ? candidate.controls : '',
      status,
      media: parseCommittedMedia(candidate.media),
      multiplayer: parseCommittedMultiplayer(candidate.multiplayer),
      orientation: GAME_ORIENTATIONS.has(orientationRaw as CatalogGameOrientation)
        ? (orientationRaw as CatalogGameOrientation)
        : 'any',
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

function parseGameMedia(metadataJson: string | null): CatalogGameMedia | null {
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
function parseSpecTitle(specMd: string): string | null {
  return parseSpecFrontmatter(specMd).title || null;
}
