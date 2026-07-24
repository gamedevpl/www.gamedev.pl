import { transform } from 'esbuild';

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
// lists are independent copies and a mismatch silently breaks bundling.
const GAME_KIT_MODULES = ['input', 'collision', 'drawing', 'effects', 'audio', 'party'] as const;

interface GameManifest {
  engine?: { modules?: unknown };
  audio?: { sounds?: unknown };
}

function parseGameManifest(source: string): { modules: string[]; sounds: string[] } {
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

  const sounds = manifest.audio?.sounds;
  if (!modules.includes('audio')) {
    return { modules, sounds: [] };
  }
  if (
    !Array.isArray(sounds) ||
    sounds.length === 0 ||
    new Set(sounds).size !== sounds.length ||
    sounds.some((soundName) => typeof soundName !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(soundName))
  ) {
    throw new Error('game manifest contains invalid audio sounds');
  }
  return { modules, sounds };
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
}

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
   * Reads a game's source files from a branch (typically an unmerged PR head).
   * Returns null if the game directory or a required file is missing on that ref.
   */
  getGameSources(ref: string, slug: string): Promise<GameSources | null>;
  /**
   * Reads a website-ready screenshot or gameplay video from a published game's
   * media directory. Callers must still validate the filename against catalog
   * metadata before exposing the bytes.
   */
  getGameMedia(ref: string, slug: string, filename: string): Promise<Uint8Array | null>;
  /**
   * Builds the game catalog straight from the repo: lists `games/` directories
   * on `ref` and reads each game's SPEC.md frontmatter. Replaces the old
   * dependency on the public GitHub Pages `catalog.json` so the games repo can
   * be private. Games with a missing or unparseable SPEC.md are skipped.
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

export function createGitHubClient(options: GitHubClientOptions): GitHubClient {
  const { token, repo } = options;
  const fetchImpl = options.fetchImpl ?? fetch;
  const { owner, name } = parseRepo(repo);

  /** Reads a file's raw bytes from the contents API; null when it doesn't exist on `ref`. */
  async function readRawFile(path: string, ref: string): Promise<string | null> {
    const url = `https://api.github.com/repos/${repo}/contents/${path}?ref=${encodeURIComponent(ref)}`;
    const response = await fetchImpl(url, {
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
    const response = await fetchImpl(url, {
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
    const response = await fetchImpl(url, {
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

    async findLinkedPR(issueNumber) {
      const response = await requestJson<
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
                      nodes: Array<{ commit: { messageHeadline: string; committedDate: string } }>;
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
            }
          `,
          variables: { owner, name, issueNumber },
        }),
      });

      if (response.errors?.length) {
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
      };
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
      const assetsJs =
        assetEntries.length > 0
          ? `window.__GAME_AUDIO_ASSETS__ = Object.freeze(${JSON.stringify(Object.fromEntries(assetEntries))});\n`
          : '';
      const transpiledSources = await Promise.all(
        [coreTs, ...availableModuleSources, gameTs].map(async (source) => {
          const result = await transform(source, {
            loader: 'ts',
            target: 'es2022',
            format: 'iife',
            legalComments: 'inline',
          });
          return result.code;
        }),
      );
      const gameJs = transpiledSources.pop() ?? '';
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

    async getCatalog(ref) {
      const listing = await requestJson<Array<{ name: string; type: string }>>(
        `https://api.github.com/repos/${repo}/contents/games?ref=${encodeURIComponent(ref)}`,
      );

      const slugs = listing
        .filter((entry) => entry.type === 'dir' && /^[a-z0-9][a-z0-9-]*$/.test(entry.name))
        .map((entry) => entry.name)
        .sort();

      const entries = await Promise.all(
        slugs.map(async (slug): Promise<CatalogGameEntry | null> => {
          const specMd = await readRawFile(`games/${slug}/SPEC.md`, ref);
          if (specMd === null) {
            return null;
          }
          const frontmatter = parseSpecFrontmatter(specMd);
          const title = frontmatter.title;
          if (!title) {
            return null;
          }
          const status = frontmatter.status ?? '';
          const mediaMetadata =
            status === 'published' ? await readRawFile(`games/${slug}/media/metadata.json`, ref) : null;
          return {
            slug,
            title,
            genre: frontmatter.genre ?? '',
            controls: frontmatter.controls ?? '',
            status,
            media: parseGameMedia(mediaMetadata),
            multiplayer: parseMultiplayer(frontmatter),
          };
        }),
      );

      return entries.filter((entry): entry is CatalogGameEntry => entry !== null);
    },
  };
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
