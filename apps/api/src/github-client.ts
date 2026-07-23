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

/** The three source files that make up a game in the games repo. */
export interface GameSources {
  indexHtml: string;
  gameJs: string;
  styleCss: string;
  /** SPEC.md frontmatter title, when present. */
  title: string | null;
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
}

export interface GitHubClient {
  createIssue(input: CreateIssueInput): Promise<{ number: number }>;
  getIssueState(issueNumber: number): Promise<{ state: 'open' | 'closed' }>;
  findLinkedPR(issueNumber: number): Promise<LinkedPullRequest | null>;
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

      const [indexHtml, gameJs, styleCss, specMd] = await Promise.all([
        readRawFile(`games/${slug}/index.html`, ref),
        readRawFile(`games/${slug}/game.js`, ref),
        readRawFile(`games/${slug}/style.css`, ref),
        readRawFile(`games/${slug}/SPEC.md`, ref),
      ]);

      if (indexHtml === null || gameJs === null || styleCss === null) {
        return null;
      }

      return { indexHtml, gameJs, styleCss, title: specMd ? parseSpecTitle(specMd) : null };
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
