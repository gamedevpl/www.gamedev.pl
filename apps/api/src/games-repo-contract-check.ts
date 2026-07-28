/**
 * The cross-repo lockstep check itself (issue #247), separated from the CI script
 * so its failure modes are unit-testable.
 *
 * Reads `tools/lib/assemble.ts` and `tools/validate.ts` from the games repo and
 * asserts they still match `games-repo-contract.ts` on this side. Two outcomes are
 * emphatically not the same thing, and the difference is why this lives here:
 *
 *   - **drift** — the two halves disagree. That is the bug this check exists to
 *     catch, and it fails CI.
 *   - **unreachable** — the games repo could not be read at all (the shared PAT is
 *     out of quota, expired, or GitHub is down). That is no evidence about drift in
 *     either direction, so it must not read as one. `GAMES_REPO_TOKEN` is a single
 *     token shared with the snapshot bake, which spends thousands of contents reads
 *     per run; when it hits the hourly limit, every PR in this repo and master would
 *     otherwise go red on a check that never actually compared anything.
 *
 * The remaining defence against an unreachable remote silently disabling the check
 * is that it says so loudly — as a CI annotation, with GitHub's own rate-limit
 * headers — and that `GAMES_CONTRACT_REQUIRE_REMOTE=1` turns it back into a failure
 * for anyone who wants the strict posture.
 */

import {
  extractGameKitModules,
  extractMaxBundleBytes,
  extractMusicContractSignals,
  GAME_KIT_MODULES,
  MAX_PROJECT_BYTES,
} from './games-repo-contract.js';
import { isRateLimitResponse } from './github-rate-limit.js';

export type ContractCheckOutcome =
  /** No token configured — forks and fresh clones still go green. */
  | { kind: 'skipped'; reason: string }
  /** The games repo could not be read. Says nothing about drift. */
  | { kind: 'unreachable'; reason: string }
  /** Both halves agree. */
  | { kind: 'ok' }
  /** The halves disagree — the failure this check is for. */
  | { kind: 'drift'; reason: string };

export interface ContractCheckOptions {
  repo: string;
  ref: string;
  token: string;
  fetchImpl?: typeof fetch;
  /** Progress lines (stdout in CI). */
  log?: (message: string) => void;
  /** Test seam — replaced so retry backoff does not slow the suite. */
  sleep?: (ms: number) => Promise<void>;
}

/** Attempts per file, including the first. Bounded so a dead remote fails fast. */
const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 1_000;
/** Never wait longer than this for one retry — a CI job may not sit on a quota reset. */
const MAX_RETRY_DELAY_MS = 10_000;
/** Enough of GitHub's error body to name the cause without pasting a page of JSON. */
const MAX_BODY_CHARS = 300;

class UnreachableGamesRepoError extends Error {}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 5xx and network faults are worth another go; 4xx other than a rate limit is not. */
function isTransientResponse(response: Response): boolean {
  return isRateLimitResponse(response) || response.status >= 500;
}

/**
 * GitHub's own account of the request: status, its `message` field, and the quota
 * headers. Without these a 403 is indistinguishable between "out of quota" and
 * "this token may not read that repo", which are opposite operator actions.
 */
async function describeFailure(response: Response): Promise<string> {
  const parts = [`${response.status} ${response.statusText}`];

  const body = await response.text().catch(() => '');
  if (body) {
    let message = body;
    try {
      const parsed = JSON.parse(body) as { message?: unknown };
      if (typeof parsed.message === 'string') {
        message = parsed.message;
      }
    } catch {
      // Not JSON — fall back to the raw body.
    }
    parts.push(message.slice(0, MAX_BODY_CHARS).trim());
  }

  const quota = describeQuota(response);
  if (quota) {
    parts.push(quota);
  }
  const retryAfter = response.headers.get('retry-after');
  if (retryAfter) {
    parts.push(`retry-after=${retryAfter}s`);
  }
  return parts.filter(Boolean).join(' — ');
}

/** `used/limit` plus the reset time, when GitHub sent the headers. */
export function describeQuota(response: Response): string | null {
  const remaining = response.headers.get('x-ratelimit-remaining');
  const limit = response.headers.get('x-ratelimit-limit');
  if (remaining === null && limit === null) {
    return null;
  }
  const reset = Number(response.headers.get('x-ratelimit-reset'));
  const resetAt = Number.isFinite(reset) && reset > 0 ? new Date(reset * 1000).toISOString() : null;
  return `rate limit ${remaining ?? '?'}/${limit ?? '?'} remaining${resetAt ? `, resets ${resetAt}` : ''}`;
}

export async function runGamesRepoContractCheck(options: ContractCheckOptions): Promise<ContractCheckOutcome> {
  const { repo, ref, token } = options;
  const fetchImpl = options.fetchImpl ?? fetch;
  const log = options.log ?? (() => {});
  const sleep = options.sleep ?? defaultSleep;

  if (!token) {
    return {
      kind: 'skipped',
      reason:
        'GAMES_REPO_TOKEN unset — skipping live fetch. Unit tests still guard the website half; ' +
        'set a contents:read PAT on the games repo as the GAMES_REPO_TOKEN Actions secret to ' +
        'enable the cross-repo check.',
    };
  }

  async function readGamesRepoFile(path: string): Promise<string> {
    const url = `https://api.github.com/repos/${repo}/contents/${path}?ref=${encodeURIComponent(ref)}`;
    let lastFailure = 'no attempt was made';

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      let response: Response;
      try {
        response = await fetchImpl(url, {
          headers: {
            Accept: 'application/vnd.github.raw',
            Authorization: `Bearer ${token}`,
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': 'gamedevpl-games-repo-contract-check',
          },
        });
      } catch (error: unknown) {
        // A network fault is transient by definition — retry it like a 5xx.
        lastFailure = error instanceof Error ? error.message : String(error);
        if (attempt + 1 < MAX_ATTEMPTS) {
          await sleep(RETRY_BASE_DELAY_MS * 2 ** attempt);
          continue;
        }
        break;
      }

      if (response.ok) {
        const quota = describeQuota(response);
        if (quota) {
          log(`  · ${path}: ${quota}`);
        }
        return response.text();
      }

      lastFailure = await describeFailure(response);
      if (!isTransientResponse(response) || attempt + 1 >= MAX_ATTEMPTS) {
        break;
      }

      const retryAfterSeconds = Number(response.headers.get('retry-after'));
      const delayMs =
        Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
          ? retryAfterSeconds * 1000
          : RETRY_BASE_DELAY_MS * 2 ** attempt;
      if (delayMs > MAX_RETRY_DELAY_MS) {
        break;
      }
      log(`  · ${path}: ${lastFailure} — retrying in ${Math.round(delayMs / 1000)}s`);
      await sleep(delayMs);
    }

    throw new UnreachableGamesRepoError(`cannot read ${repo}@${ref}:${path} (${lastFailure})`);
  }

  let assembleSource: string;
  let validateSource: string;
  try {
    [assembleSource, validateSource] = await Promise.all([
      readGamesRepoFile('tools/lib/assemble.ts'),
      readGamesRepoFile('tools/validate.ts'),
    ]);
  } catch (error: unknown) {
    if (error instanceof UnreachableGamesRepoError) {
      return { kind: 'unreachable', reason: error.message };
    }
    throw error;
  }

  const remoteModules = extractGameKitModules(assembleSource);
  const localModules = [...GAME_KIT_MODULES];
  if (remoteModules.join(',') !== localModules.join(',')) {
    return {
      kind: 'drift',
      reason:
        `GAME_KIT_MODULES mismatch.\n  games-repo: ${remoteModules.join(', ')}\n` +
        `  website:    ${localModules.join(', ')}`,
    };
  }
  log(`  ✓ GAME_KIT_MODULES (${remoteModules.length} modules)`);

  const remoteBudget = extractMaxBundleBytes(validateSource);
  if (remoteBudget !== MAX_PROJECT_BYTES) {
    const assignLine =
      validateSource
        .split('\n')
        .find((line) => /MAX_BUNDLE_BYTES\s*=/.test(line))
        ?.trim() ?? '(assignment line not found)';
    return {
      kind: 'drift',
      reason:
        `MAX_BUNDLE_BYTES mismatch: games-repo=${remoteBudget} website MAX_PROJECT_BYTES=${MAX_PROJECT_BYTES}\n` +
        `  games-repo assignment: ${assignLine}\n` +
        `  Update GAMEKIT_PLATFORM_BYTES / MAX_PROJECT_BYTES in apps/api/src/games-repo-contract.ts to match.`,
    };
  }
  log(`  ✓ MAX_BUNDLE_BYTES / MAX_PROJECT_BYTES (${remoteBudget})`);

  const music = extractMusicContractSignals(assembleSource);
  if (!music.injectsMusicName || !music.readsTracksKey || !music.readsMusicCatalog) {
    const musicLines = assembleSource
      .split('\n')
      .map((line, index) => ({ line: line.trim(), n: index + 1 }))
      .filter(({ line }) => /music|__GAME_AUDIO|__GAME_MUSIC|tracks/i.test(line))
      .slice(0, 40)
      .map(({ line, n }) => `  L${n}: ${line}`)
      .join('\n');
    return {
      kind: 'drift',
      reason:
        `music contract mismatch in games-repo assemble.ts: ` +
        `injectsMusicName=${music.injectsMusicName} readsTracksKey=${music.readsTracksKey} ` +
        `readsMusicCatalog=${music.readsMusicCatalog}\nrelevant lines:\n${musicLines || '  (none)'}`,
    };
  }
  log('  ✓ music contract (__GAME_AUDIO_MUSIC__ + tracks + readMusicCatalog)');

  return { kind: 'ok' };
}
