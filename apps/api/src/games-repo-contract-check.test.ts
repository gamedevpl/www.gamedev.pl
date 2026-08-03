import { describe, expect, it, vi } from 'vitest';
import { runGamesRepoContractCheck } from './games-repo-contract-check.js';
import { GAME_KIT_MODULES, MAX_PROJECT_BYTES } from './games-repo-contract.js';

const ASSEMBLE_SOURCE = `
  const GAME_KIT_MODULES = [${GAME_KIT_MODULES.map((name) => `'${name}'`).join(', ')}];
  const catalog = readMusicCatalog();
  const track = catalog.tracks[name];
  out += 'window.__GAME_AUDIO_MUSIC__ = ' + JSON.stringify(name);
`;

const VALIDATE_SOURCE = `const MAX_BUNDLE_BYTES = ${MAX_PROJECT_BYTES};`;

function ok(body: string, headers: Record<string, string> = {}): Response {
  return new Response(body, { status: 200, headers });
}

function failure(status: number, headers: Record<string, string> = {}, message = 'nope'): Response {
  return new Response(JSON.stringify({ message }), { status, headers });
}

/** Serves each requested path from `pages`, in the order given per path. */
function createFetch(pages: Record<string, Response[]>): { fetchImpl: typeof fetch; calls: string[] } {
  const calls: string[] = [];
  const fetchImpl = (async (url: string | URL | Request) => {
    const href = String(url);
    calls.push(href);
    const key = Object.keys(pages).find((path) => href.includes(path));
    const queue = key ? pages[key] : undefined;
    if (!queue || queue.length === 0) {
      throw new Error(`unexpected fetch: ${href}`);
    }
    return queue.length === 1 ? queue[0].clone() : (queue.shift() as Response);
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

const BASE = { repo: 'gamedevpl/www.gamedev.pl-games', ref: 'main', token: 't', sleep: async () => {} };

describe('runGamesRepoContractCheck', () => {
  it('passes when both halves agree', async () => {
    const { fetchImpl } = createFetch({
      'tools/lib/assemble.ts': [ok(ASSEMBLE_SOURCE)],
      'tools/validate.ts': [ok(VALIDATE_SOURCE)],
    });

    await expect(runGamesRepoContractCheck({ ...BASE, fetchImpl })).resolves.toEqual({ kind: 'ok' });
  });

  it('reports drift when the games-repo budget moved ahead of the website', async () => {
    const { fetchImpl } = createFetch({
      'tools/lib/assemble.ts': [ok(ASSEMBLE_SOURCE)],
      'tools/validate.ts': [ok(`const MAX_BUNDLE_BYTES = ${MAX_PROJECT_BYTES + 679};`)],
    });

    const outcome = await runGamesRepoContractCheck({ ...BASE, fetchImpl });
    expect(outcome.kind).toBe('drift');
    expect(outcome.kind === 'drift' && outcome.reason).toContain('MAX_BUNDLE_BYTES mismatch');
  });

  it('passes when the website budget is ahead of games-repo main (website-first)', async () => {
    const { fetchImpl } = createFetch({
      'tools/lib/assemble.ts': [ok(ASSEMBLE_SOURCE)],
      'tools/validate.ts': [ok(`const MAX_BUNDLE_BYTES = ${MAX_PROJECT_BYTES - 8_000};`)],
    });

    await expect(runGamesRepoContractCheck({ ...BASE, fetchImpl })).resolves.toEqual({ kind: 'ok' });
  });

  it('reports drift when the module order diverges', async () => {
    const { fetchImpl } = createFetch({
      'tools/lib/assemble.ts': [ok(ASSEMBLE_SOURCE.replace("'input'", "'sensing', 'input'"))],
      'tools/validate.ts': [ok(VALIDATE_SOURCE)],
    });

    const outcome = await runGamesRepoContractCheck({ ...BASE, fetchImpl });
    expect(outcome.kind).toBe('drift');
    expect(outcome.kind === 'drift' && outcome.reason).toContain('GAME_KIT_MODULES mismatch');
  });

  it('allows the website to list modules the games tip has not shipped yet', async () => {
    // Website-first adds: GAME_KIT_MODULES here already includes these modules, but
    // main's assemble.ts may still list the older order. That window must stay green.
    const aheadModules = new Set(['voice', 'racing']);
    const withoutAheadExtras = GAME_KIT_MODULES.filter((name) => !aheadModules.has(name));
    const olderAssemble = `
      const GAME_KIT_MODULES = [${withoutAheadExtras.map((name) => `'${name}'`).join(', ')}];
      const catalog = readMusicCatalog();
      const track = catalog.tracks[name];
      out += 'window.__GAME_AUDIO_MUSIC__ = ' + JSON.stringify(name);
    `;
    const { fetchImpl } = createFetch({
      'tools/lib/assemble.ts': [ok(olderAssemble)],
      'tools/validate.ts': [ok(VALIDATE_SOURCE)],
    });

    await expect(runGamesRepoContractCheck({ ...BASE, fetchImpl })).resolves.toEqual({ kind: 'ok' });
  });

  it('reports drift when a local-only module is not in the declared-ahead list', async () => {
    // If games-repo drops a module that was never declared website-ahead, the
    // check must report drift rather than silently passing. (Codex review — PR #379.)
    const remoteWithout = GAME_KIT_MODULES.filter((name) => name !== 'collision');
    const assembleWithout = `
      const GAME_KIT_MODULES = [${remoteWithout.map((name) => `'${name}'`).join(', ')}];
      const catalog = readMusicCatalog();
      const track = catalog.tracks[name];
      out += 'window.__GAME_AUDIO_MUSIC__ = ' + JSON.stringify(name);
    `;
    const { fetchImpl } = createFetch({
      'tools/lib/assemble.ts': [ok(assembleWithout)],
      'tools/validate.ts': [ok(VALIDATE_SOURCE)],
    });

    const outcome = await runGamesRepoContractCheck({ ...BASE, fetchImpl });
    expect(outcome.kind).toBe('drift');
    expect(outcome.kind === 'drift' && outcome.reason).toContain('Undeclared website-ahead modules');
    expect(outcome.kind === 'drift' && outcome.reason).toContain('collision');
  });

  it('skips without a token so forks and fresh clones stay green', async () => {
    const outcome = await runGamesRepoContractCheck({
      ...BASE,
      token: '',
      fetchImpl: (() => {
        throw new Error('must not fetch');
      }) as unknown as typeof fetch,
    });
    expect(outcome.kind).toBe('skipped');
  });

  it('retries a rate-limited read and succeeds on the retry', async () => {
    const { fetchImpl, calls } = createFetch({
      'tools/lib/assemble.ts': [ok(ASSEMBLE_SOURCE)],
      'tools/validate.ts': [
        failure(403, { 'x-ratelimit-remaining': '0', 'x-ratelimit-limit': '5000' }, 'API rate limit exceeded'),
        ok(VALIDATE_SOURCE),
      ],
    });

    await expect(runGamesRepoContractCheck({ ...BASE, fetchImpl })).resolves.toEqual({ kind: 'ok' });
    expect(calls.filter((url) => url.includes('tools/validate.ts'))).toHaveLength(2);
  });

  it('waits the Retry-After a secondary limit asks for', async () => {
    const sleep = vi.fn(async () => {});
    const { fetchImpl } = createFetch({
      'tools/lib/assemble.ts': [ok(ASSEMBLE_SOURCE)],
      'tools/validate.ts': [failure(403, { 'retry-after': '7' }, 'secondary rate limit'), ok(VALIDATE_SOURCE)],
    });

    await runGamesRepoContractCheck({ ...BASE, fetchImpl, sleep });
    expect(sleep).toHaveBeenCalledWith(7000);
  });

  it('does not fail the build when the quota is exhausted — that is not drift', async () => {
    const reset = Math.floor(Date.UTC(2026, 6, 28, 1, 0, 0) / 1000);
    const { fetchImpl } = createFetch({
      'tools/lib/assemble.ts': [ok(ASSEMBLE_SOURCE)],
      'tools/validate.ts': [
        failure(
          403,
          { 'x-ratelimit-remaining': '0', 'x-ratelimit-limit': '5000', 'x-ratelimit-reset': String(reset) },
          'API rate limit exceeded for installation',
        ),
      ],
    });

    const outcome = await runGamesRepoContractCheck({ ...BASE, fetchImpl });
    expect(outcome.kind).toBe('unreachable');
    // The operator has to be able to tell "out of quota" from "token cannot read this".
    expect(outcome.kind === 'unreachable' && outcome.reason).toContain('API rate limit exceeded');
    expect(outcome.kind === 'unreachable' && outcome.reason).toContain('rate limit 0/5000 remaining');
    expect(outcome.kind === 'unreachable' && outcome.reason).toContain('2026-07-28T01:00:00.000Z');
  });

  it('does not retry a bare 403 — that is a permission problem, not a limit', async () => {
    const { fetchImpl, calls } = createFetch({
      'tools/lib/assemble.ts': [ok(ASSEMBLE_SOURCE)],
      'tools/validate.ts': [failure(403, {}, 'Resource not accessible by personal access token')],
    });

    const outcome = await runGamesRepoContractCheck({ ...BASE, fetchImpl });
    expect(outcome.kind).toBe('unreachable');
    expect(outcome.kind === 'unreachable' && outcome.reason).toContain('Resource not accessible');
    expect(calls.filter((url) => url.includes('tools/validate.ts'))).toHaveLength(1);
  });

  it('gives up after bounded retries on a 5xx', async () => {
    const { fetchImpl, calls } = createFetch({
      'tools/lib/assemble.ts': [ok(ASSEMBLE_SOURCE)],
      'tools/validate.ts': [
        failure(502, {}, 'Bad gateway'),
        failure(502, {}, 'Bad gateway'),
        failure(502, {}, 'Bad gateway'),
      ],
    });

    const outcome = await runGamesRepoContractCheck({ ...BASE, fetchImpl });
    expect(outcome.kind).toBe('unreachable');
    expect(calls.filter((url) => url.includes('tools/validate.ts'))).toHaveLength(3);
  });

  it('treats a network fault as unreachable rather than drift', async () => {
    const fetchImpl = (async () => {
      throw new Error('getaddrinfo ENOTFOUND api.github.com');
    }) as unknown as typeof fetch;

    const outcome = await runGamesRepoContractCheck({ ...BASE, fetchImpl });
    expect(outcome.kind).toBe('unreachable');
    expect(outcome.kind === 'unreachable' && outcome.reason).toContain('ENOTFOUND');
  });
});
