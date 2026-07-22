interface CreateIssueInput {
  title: string;
  body: string;
  labels: string[];
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
}

/** The three source files that make up a game in the games repo. */
export interface GameSources {
  indexHtml: string;
  gameJs: string;
  styleCss: string;
  /** SPEC.md frontmatter title, when present. */
  title: string | null;
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
                    headRefName: string;
                    files: { nodes: Array<{ path: string }> };
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
                            headRefName
                            files(first: 100) {
                              nodes {
                                path
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
        // Populated for every linked PR (the files connection is already queried):
        // merged PRs use it to resolve the published slug, open PRs to locate the
        // game directory for an unmerged preview.
        changedFiles: pullRequestNode.files.nodes.map((node) => node.path),
      };
    },

    async getGameSources(ref, slug) {
      // Only well-formed slugs address a game directory; reject anything that could
      // escape it (path traversal, nested paths) before it reaches the contents API.
      if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
        return null;
      }

      async function readFile(fileName: string): Promise<string | null> {
        const url =
          `https://api.github.com/repos/${repo}/contents/games/${slug}/${fileName}` + `?ref=${encodeURIComponent(ref)}`;
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

      const [indexHtml, gameJs, styleCss, specMd] = await Promise.all([
        readFile('index.html'),
        readFile('game.js'),
        readFile('style.css'),
        readFile('SPEC.md'),
      ]);

      if (indexHtml === null || gameJs === null || styleCss === null) {
        return null;
      }

      return { indexHtml, gameJs, styleCss, title: specMd ? parseSpecTitle(specMd) : null };
    },
  };
}

/** Extracts the `title:` value from a game's SPEC.md YAML frontmatter, if any. */
function parseSpecTitle(specMd: string): string | null {
  const frontmatter = /^---\s*\n([\s\S]*?)\n---/.exec(specMd);
  const body = frontmatter?.[1] ?? specMd;
  const matched = /^title:\s*(.+?)\s*$/m.exec(body);
  if (!matched?.[1]) {
    return null;
  }
  return matched[1].replace(/^["']|["']$/g, '').trim() || null;
}
