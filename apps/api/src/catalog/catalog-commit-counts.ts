const CHUNK = 20;
const SAFE_REF = /^[A-Za-z0-9._/-]+$/;
const SAFE_SLUG = /^[a-z0-9][a-z0-9-]*$/;

export interface FetchGameCommitCountsOptions {
  repo: string;
  ref: string;
  slugs: readonly string[];
  token: string;
  fetchImpl?: typeof fetch;
}

interface GraphQLResponse {
  data?: {
    repository?: {
      object?: Record<string, { totalCount?: number } | null> | null;
    } | null;
  };
  errors?: Array<{ message: string }>;
}

export async function fetchGameCommitCounts(options: FetchGameCommitCountsOptions): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (!SAFE_REF.test(options.ref)) return counts;
  const [owner, name] = options.repo.split('/');
  if (!owner || !name) return counts;
  const slugs = options.slugs.filter((slug) => SAFE_SLUG.test(slug));
  const fetchImpl = options.fetchImpl ?? fetch;

  for (let offset = 0; offset < slugs.length; offset += CHUNK) {
    const chunk = slugs.slice(offset, offset + CHUNK);
    const fields = chunk
      .map((slug, index) => `c${offset + index}: history(path: "games/${slug}/") { totalCount }`)
      .join('\n');
    const response = await fetchImpl('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${options.token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'gamedevpl-games-snapshot-bake',
      },
      body: JSON.stringify({
        query: `
          query GameCommits($owner: String!, $name: String!) {
            repository(owner: $owner, name: $name) {
              object(expression: "${options.ref}") {
                ... on Commit {
                  ${fields}
                }
              }
            }
          }
        `,
        variables: { owner, name },
      }),
    });
    if (!response.ok) return new Map();
    const body = (await response.json()) as GraphQLResponse;
    if (body.errors?.length) return new Map();
    const commit = body.data?.repository?.object;
    if (!commit) return new Map();
    for (const [index, slug] of chunk.entries()) {
      const total = commit[`c${offset + index}`]?.totalCount;
      if (typeof total === 'number' && Number.isFinite(total) && total >= 0) {
        counts.set(slug, Math.floor(total));
      }
    }
  }
  return counts;
}

export function slugsFromArchivePaths(paths: readonly string[]): string[] {
  const slugs = new Set<string>();
  for (const filePath of paths) {
    const match = /^games\/([a-z0-9][a-z0-9-]*)\//.exec(filePath);
    if (match) slugs.add(match[1]);
  }
  return [...slugs];
}

export async function withArchiveCommitCounts<T extends { listPaths: () => readonly string[] }>(
  archive: T,
  options: Omit<FetchGameCommitCountsOptions, 'slugs'>,
): Promise<T & { commitCounts?: Map<string, number> }> {
  try {
    const commitCounts = await fetchGameCommitCounts({
      ...options,
      slugs: slugsFromArchivePaths(archive.listPaths()),
    });
    return commitCounts.size > 0 ? { ...archive, commitCounts } : archive;
  } catch {
    return archive;
  }
}
