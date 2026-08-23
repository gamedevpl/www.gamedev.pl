import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGitHubClient, type GitHubClient } from './github-client.js';

/**
 * A local stand-in for the games repo, so the whole product runs on a laptop with no
 * GitHub token and no access to the (private) games repository.
 *
 * It fakes GitHub at the `fetchImpl` boundary rather than reimplementing GitHubClient.
 * That seam matters: catalog parsing, TypeScript bundling, module resolution and audio
 * embedding are intricate and already written once in github-client.ts — a second
 * implementation would drift from it silently, which is exactly the failure the
 * GAME_KIT_MODULES comment there warns about. Faking the transport means local dev
 * exercises the real code path, so a bug found locally is a bug that exists in prod.
 *
 * Contents requests are served from a directory laid out like the games repo
 * (`games/<slug>/...`, `shared/...`). The issue endpoints are an in-memory fiction:
 * enough for the creation flow to complete end to end without opening real issues
 * against a real repository.
 */

const currentDir = path.dirname(fileURLToPath(import.meta.url));

/** Bundled fixtures — the fallback when no games checkout is available. */
export const FIXTURE_GAMES_DIR = path.resolve(currentDir, '../../fixtures/games-repo');

/**
 * Where a real games checkout is expected when someone has one. A sibling directory is
 * the layout the project itself uses, so contributors who clone both repos get the full
 * catalog locally without configuring anything.
 */
export const DEFAULT_LOCAL_GAMES_DIR = path.resolve(currentDir, '../../../../../www.gamedev.pl-games');

interface LocalGamesRepoOptions {
  /** Root of a games-repo-shaped directory. */
  rootDir: string;
}

/** Resolves a repo-relative path inside `rootDir`, or null if it would escape it. */
function resolveInside(rootDir: string, repoPath: string): string | null {
  const resolved = path.resolve(rootDir, repoPath);
  const rootWithSep = rootDir.endsWith(path.sep) ? rootDir : `${rootDir}${path.sep}`;
  return resolved === rootDir || resolved.startsWith(rootWithSep) ? resolved : null;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * A `fetch` implementation that answers the subset of the GitHub API the client uses,
 * reading game content from disk and inventing issue state in memory.
 */
export function createLocalGamesFetch(options: LocalGamesRepoOptions): typeof fetch {
  const { rootDir } = options;

  // Issue numbers start high enough to be obviously synthetic in logs and UI.
  let nextIssueNumber = 1000;
  const issues = new Map<number, { state: 'open' | 'closed'; body: string }>();
  let nextCommentId = 1;

  return async function localFetch(input: Parameters<typeof fetch>[0], init?: RequestInit): Promise<Response> {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const method = (init?.method ?? 'GET').toUpperCase();
    const pathname = url.pathname;

    // --- Repository contents -------------------------------------------------
    const contentsMatch = pathname.match(/^\/repos\/[^/]+\/[^/]+\/contents\/(.+)$/);
    if (contentsMatch) {
      const repoPath = decodeURIComponent(contentsMatch[1]);
      const absolutePath = resolveInside(rootDir, repoPath);
      if (!absolutePath) {
        return jsonResponse({ message: 'Not Found' }, 404);
      }

      const headers = new Headers(init?.headers ?? {});
      const wantsRaw = (headers.get('Accept') ?? '').includes('raw');

      // A JSON Accept on a contents path is the directory listing used to enumerate games.
      if (!wantsRaw) {
        try {
          const dirEntries = await readdir(absolutePath, { withFileTypes: true });
          return jsonResponse(
            dirEntries.map((entry) => ({
              name: entry.name,
              type: entry.isDirectory() ? 'dir' : 'file',
            })),
          );
        } catch {
          return jsonResponse({ message: 'Not Found' }, 404);
        }
      }

      try {
        const bytes = await readFile(absolutePath);
        // Uint8Array (not Buffer) so `response.arrayBuffer()` yields exactly these bytes.
        return new Response(new Uint8Array(bytes), { status: 200 });
      } catch {
        return jsonResponse({ message: 'Not Found' }, 404);
      }
    }

    // --- Issues (in-memory fiction) ------------------------------------------
    if (method === 'POST' && /\/repos\/[^/]+\/[^/]+\/issues$/.test(pathname)) {
      const issueNumber = nextIssueNumber++;
      issues.set(issueNumber, { state: 'open', body: '' });
      return jsonResponse({ number: issueNumber });
    }

    const commentMatch = pathname.match(/\/repos\/[^/]+\/[^/]+\/issues\/(\d+)\/comments$/);
    if (commentMatch && method === 'POST') {
      return jsonResponse({ id: nextCommentId++ });
    }

    const issueMatch = pathname.match(/\/repos\/[^/]+\/[^/]+\/issues\/(\d+)$/);
    if (issueMatch) {
      const issueNumber = Number(issueMatch[1]);
      const issue = issues.get(issueNumber) ?? { state: 'open' as const, body: '' };
      if (method === 'PATCH') {
        const payload = init?.body ? (JSON.parse(String(init.body)) as { state?: string; body?: string }) : {};
        issues.set(issueNumber, {
          state: payload.state === 'closed' ? 'closed' : issue.state,
          body: payload.body ?? issue.body,
        });
        return jsonResponse({ number: issueNumber });
      }
      return jsonResponse({ number: issueNumber, state: issue.state });
    }

    if (method === 'PATCH' && /\/repos\/[^/]+\/[^/]+\/pulls\/\d+$/.test(pathname)) {
      return jsonResponse({});
    }

    // --- GraphQL --------------------------------------------------------------
    // findLinkedPR asks about an issue's timeline; catalog asks for Blob text by
    // expression. Locally no agent ever opens a pull request, so the timeline
    // answer is always empty. Catalog expressions are answered from disk so the
    // GraphQL path exercised in production is the same one local/fixtures use.
    if (pathname === '/graphql') {
      const payload = init?.body ? (JSON.parse(String(init.body)) as { query?: string }) : {};
      const query = payload.query ?? '';

      if (query.includes('object(expression:')) {
        const repository: Record<string, { text: string } | null> = {};
        const aliasPattern = /(\w+)\s*:\s*object\(expression:\s*"([^"]+)"\)/g;
        for (const match of query.matchAll(aliasPattern)) {
          const alias = match[1];
          const expression = match[2];
          const colon = expression.indexOf(':');
          const repoPath = colon >= 0 ? expression.slice(colon + 1) : expression;
          const absolutePath = resolveInside(rootDir, repoPath);
          if (!absolutePath) {
            repository[alias] = null;
            continue;
          }
          try {
            repository[alias] = { text: await readFile(absolutePath, 'utf8') };
          } catch {
            repository[alias] = null;
          }
        }
        return jsonResponse({ data: { repository } });
      }

      return jsonResponse({ data: { repository: { issue: { timelineItems: { nodes: [] } } } } });
    }

    return jsonResponse({ message: `local games repo has no route for ${method} ${pathname}` }, 404);
  } as typeof fetch;
}

/** A GitHubClient backed entirely by local files and in-memory issue state. */
export function createLocalGamesClient(options: LocalGamesRepoOptions): GitHubClient {
  return createGitHubClient({
    token: 'local-development',
    repo: 'local/games',
    fetchImpl: createLocalGamesFetch(options),
  });
}

/**
 * Picks the directory to serve games from: a real checkout when one is present,
 * otherwise the bundled fixtures. `GAMES_LOCAL_DIR` overrides both.
 *
 * Returning the fixtures rather than nothing is the point of the whole module — a
 * first-time contributor should meet a working arcade, not an error banner.
 */
export async function resolveLocalGamesDir(env: NodeJS.ProcessEnv = process.env): Promise<{
  rootDir: string;
  source: 'env' | 'checkout' | 'fixtures';
}> {
  const configured = env.GAMES_LOCAL_DIR?.trim();
  if (configured) {
    return { rootDir: path.resolve(configured), source: 'env' };
  }

  try {
    const gamesDir = path.join(DEFAULT_LOCAL_GAMES_DIR, 'games');
    const entries = await readdir(gamesDir);
    if (entries.length > 0) {
      return { rootDir: DEFAULT_LOCAL_GAMES_DIR, source: 'checkout' };
    }
  } catch {
    // No sibling checkout — fixtures it is.
  }

  return { rootDir: FIXTURE_GAMES_DIR, source: 'fixtures' };
}
