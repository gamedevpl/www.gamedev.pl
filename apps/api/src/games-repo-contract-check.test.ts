import { describe, expect, it, vi } from 'vitest';
import { runGamesRepoContractCheck } from './games-repo-contract-check.js';
import {
  DELIVERY_CONTRACT_PATH,
  DELIVERY_CONTRACT_VERSION,
  DELIVERY_EXTRA_MODULE_PATTERN,
  DELIVERY_FIXED_FILES,
  DELIVERY_MAX_FILES,
  DELIVERY_MAX_UPLOAD_BYTES,
  DELIVERY_RESERVED_SEGMENTS,
  GAME_KIT_MODULES,
  MAX_PROJECT_BYTES,
} from './games-repo-contract.js';

const ASSEMBLE_SOURCE = `
  const GAME_KIT_MODULES = [${GAME_KIT_MODULES.map((name) => `'${name}'`).join(', ')}];
  const catalog = readMusicCatalog();
  const track = catalog.tracks[name];
  out += 'window.__GAME_AUDIO_MUSIC__ = ' + JSON.stringify(name);
`;

const VALIDATE_SOURCE = `const MAX_BUNDLE_BYTES = ${MAX_PROJECT_BYTES};`;

/** The games-repo delivery contract as it stands when the two halves agree. */
function deliverySource(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    version: DELIVERY_CONTRACT_VERSION,
    _comment: 'prose the parser ignores',
    fixedFiles: [...DELIVERY_FIXED_FILES],
    extraModulePattern: DELIVERY_EXTRA_MODULE_PATTERN.source,
    reservedSegments: [...DELIVERY_RESERVED_SEGMENTS],
    maxFiles: DELIVERY_MAX_FILES,
    maxUploadBytes: DELIVERY_MAX_UPLOAD_BYTES,
    ...overrides,
  });
}

/** The three files the check reads, all in agreement. */
function agreeingPages(delivery: string | Response[] = deliverySource()): Record<string, Response[]> {
  return {
    'tools/lib/assemble.ts': [ok(ASSEMBLE_SOURCE)],
    'tools/validate.ts': [ok(VALIDATE_SOURCE)],
    [DELIVERY_CONTRACT_PATH]: typeof delivery === 'string' ? [ok(delivery)] : delivery,
  };
}

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
    const { fetchImpl } = createFetch(agreeingPages());

    await expect(runGamesRepoContractCheck({ ...BASE, fetchImpl })).resolves.toEqual({ kind: 'ok' });
  });

  it('reports drift when the games-repo budget moved ahead of the website', async () => {
    const { fetchImpl } = createFetch({
      ...agreeingPages(),
      'tools/validate.ts': [ok(`const MAX_BUNDLE_BYTES = ${MAX_PROJECT_BYTES + 679};`)],
    });

    const outcome = await runGamesRepoContractCheck({ ...BASE, fetchImpl });
    expect(outcome.kind).toBe('drift');
    expect(outcome.kind === 'drift' && outcome.reason).toContain('MAX_BUNDLE_BYTES mismatch');
  });

  it('passes when the website budget is ahead of games-repo main (website-first)', async () => {
    const { fetchImpl } = createFetch({
      ...agreeingPages(),
      'tools/validate.ts': [ok(`const MAX_BUNDLE_BYTES = ${MAX_PROJECT_BYTES - 8_000};`)],
    });

    await expect(runGamesRepoContractCheck({ ...BASE, fetchImpl })).resolves.toEqual({ kind: 'ok' });
  });

  it('reports drift when the module order diverges', async () => {
    const { fetchImpl } = createFetch({
      ...agreeingPages(),
      'tools/lib/assemble.ts': [ok(ASSEMBLE_SOURCE.replace("'input'", "'sensing', 'input'"))],
    });

    const outcome = await runGamesRepoContractCheck({ ...BASE, fetchImpl });
    expect(outcome.kind).toBe('drift');
    expect(outcome.kind === 'drift' && outcome.reason).toContain('GAME_KIT_MODULES mismatch');
  });

  it('allows a short-lived website-first module rollout', async () => {
    // Website-first adds: GAME_KIT_MODULES here already includes these modules, but
    // main's assemble.ts may still list the older order. That window must stay green.
    const aheadModules = new Set(['football', 'urban']);
    const withoutAheadExtras = GAME_KIT_MODULES.filter((name) => !aheadModules.has(name));
    const olderAssemble = `
      const GAME_KIT_MODULES = [${withoutAheadExtras.map((name) => `'${name}'`).join(', ')}];
      const catalog = readMusicCatalog();
      const track = catalog.tracks[name];
      out += 'window.__GAME_AUDIO_MUSIC__ = ' + JSON.stringify(name);
    `;
    const { fetchImpl } = createFetch({ ...agreeingPages(), 'tools/lib/assemble.ts': [ok(olderAssemble)] });

    await expect(
      runGamesRepoContractCheck({ ...BASE, fetchImpl, now: () => Date.parse('2026-08-04T00:00:00.000Z') }),
    ).resolves.toEqual({ kind: 'ok' });
  });

  it('fails closed when a website-first module rollout expires', async () => {
    const remoteWithoutFootball = GAME_KIT_MODULES.filter((name) => name !== 'football');
    const olderAssemble = `
      const GAME_KIT_MODULES = [${remoteWithoutFootball.map((name) => `'${name}'`).join(', ')}];
      const catalog = readMusicCatalog();
      const track = catalog.tracks[name];
      out += 'window.__GAME_AUDIO_MUSIC__ = ' + JSON.stringify(name);
    `;
    const { fetchImpl } = createFetch({ ...agreeingPages(), 'tools/lib/assemble.ts': [ok(olderAssemble)] });

    const outcome = await runGamesRepoContractCheck({
      ...BASE,
      fetchImpl,
      now: () => Date.parse('2026-08-10T00:00:00.000Z'),
    });
    expect(outcome.kind).toBe('drift');
    expect(outcome.kind === 'drift' && outcome.reason).toContain('expired website-ahead modules: football');
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
    const { fetchImpl } = createFetch({ ...agreeingPages(), 'tools/lib/assemble.ts': [ok(assembleWithout)] });

    const outcome = await runGamesRepoContractCheck({ ...BASE, fetchImpl });
    expect(outcome.kind).toBe('drift');
    expect(outcome.kind === 'drift' && outcome.reason).toContain('Undeclared or expired website-ahead modules');
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
      ...agreeingPages(),
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
      ...agreeingPages(),
      'tools/validate.ts': [failure(403, { 'retry-after': '7' }, 'secondary rate limit'), ok(VALIDATE_SOURCE)],
    });

    await runGamesRepoContractCheck({ ...BASE, fetchImpl, sleep });
    expect(sleep).toHaveBeenCalledWith(7000);
  });

  it('does not fail the build when the quota is exhausted — that is not drift', async () => {
    const reset = Math.floor(Date.UTC(2026, 6, 28, 1, 0, 0) / 1000);
    const { fetchImpl } = createFetch({
      ...agreeingPages(),
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
      ...agreeingPages(),
      'tools/validate.ts': [failure(403, {}, 'Resource not accessible by personal access token')],
    });

    const outcome = await runGamesRepoContractCheck({ ...BASE, fetchImpl });
    expect(outcome.kind).toBe('unreachable');
    expect(outcome.kind === 'unreachable' && outcome.reason).toContain('Resource not accessible');
    expect(calls.filter((url) => url.includes('tools/validate.ts'))).toHaveLength(1);
  });

  it('gives up after bounded retries on a 5xx', async () => {
    const { fetchImpl, calls } = createFetch({
      ...agreeingPages(),
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

describe('runGamesRepoContractCheck — delivery contract', () => {
  async function check(delivery: string | Response[]) {
    const { fetchImpl, calls } = createFetch(agreeingPages(delivery));
    return { outcome: await runGamesRepoContractCheck({ ...BASE, fetchImpl }), calls };
  }

  function driftReason(outcome: Awaited<ReturnType<typeof runGamesRepoContractCheck>>): string {
    expect(outcome.kind).toBe('drift');
    return outcome.kind === 'drift' ? outcome.reason : '';
  }

  it('reads the contract from the games repo when both halves agree', async () => {
    const { outcome, calls } = await check(deliverySource());
    expect(outcome).toEqual({ kind: 'ok' });
    expect(calls.some((url) => url.includes(DELIVERY_CONTRACT_PATH))).toBe(true);
  });

  it('reports drift, by name, for a file the games repo sends and this side refuses', async () => {
    const { outcome } = await check(deliverySource({ fixedFiles: [...DELIVERY_FIXED_FILES, 'BALANCE.json'] }));
    const reason = driftReason(outcome);
    expect(reason).toContain('delivery contract mismatch');
    expect(reason).toContain('games repo sends and this side refuses: BALANCE.json');
  });

  it('passes with a note when this side accepts a file the games repo does not list yet', async () => {
    // The documented rollout order is website-first, so this state is the safe one. If it
    // failed, the safe order would be the one that reddens master and the unsafe order the
    // comfortable one — see describeDeliveryDrift.
    const withoutEditor = DELIVERY_FIXED_FILES.filter((path) => path !== 'EDITOR.json');
    const { outcome } = await check(deliverySource({ fixedFiles: withoutEditor }));
    expect(outcome.kind).toBe('ok');
    expect((outcome as { notes?: string[] }).notes?.join('\n')).toContain('EDITOR.json');
  });

  it('reports a reorder distinctly from an add', async () => {
    const swapped = [...DELIVERY_FIXED_FILES];
    [swapped[0], swapped[1]] = [swapped[1], swapped[0]];
    const reason = driftReason((await check(deliverySource({ fixedFiles: swapped }))).outcome);
    expect(reason).toContain('fixedFiles order differs');
    expect(reason).not.toContain('sends and this side refuses');
  });

  it('does not read a website-ahead entry as a phantom reorder', async () => {
    // Dropping a middle entry shifts every later one; comparing full lists would call that
    // a reorder on top of the (tolerated) missing entry.
    const withoutTrace = DELIVERY_FIXED_FILES.filter((path) => path !== 'TRACE.json');
    const { outcome } = await check(deliverySource({ fixedFiles: withoutTrace }));
    expect(outcome.kind).toBe('ok');
  });

  it('reports drift when the extra-module pattern diverges', async () => {
    const reason = driftReason(
      (await check(deliverySource({ extraModulePattern: '^[a-z0-9][a-z0-9/-]{0,90}\\.ts$' }))).outcome,
    );
    expect(reason).toContain('extraModulePattern');
  });

  it('reports drift when either cap moves, in either direction', async () => {
    expect(driftReason((await check(deliverySource({ maxFiles: DELIVERY_MAX_FILES + 50 }))).outcome)).toContain(
      'maxFiles',
    );
    expect(
      driftReason((await check(deliverySource({ maxUploadBytes: DELIVERY_MAX_UPLOAD_BYTES / 2 }))).outcome),
    ).toContain('maxUploadBytes');
  });

  it('reports drift when the reserved segments diverge, but not when they are merely reordered', async () => {
    const reason = driftReason((await check(deliverySource({ reservedSegments: ['shared', 'tools'] }))).outcome);
    expect(reason).toContain('reservedSegments');

    const shuffled = [...DELIVERY_RESERVED_SEGMENTS].reverse();
    expect((await check(deliverySource({ reservedSegments: shuffled }))).outcome).toEqual({ kind: 'ok' });
  });

  it('reports drift on a shape-version bump — the parser has to be taught first', async () => {
    expect(driftReason((await check(deliverySource({ version: DELIVERY_CONTRACT_VERSION + 1 }))).outcome)).toContain(
      'version:',
    );
  });

  it('reports drift rather than crashing on a malformed contract file', async () => {
    expect(driftReason((await check('{ not json')).outcome)).toContain('not valid JSON');
    expect(driftReason((await check(deliverySource({ maxFiles: 'lots' }))).outcome)).toContain('positive integer');
  });

  it('tolerates a games tip that predates the contract file — 404 is not drift', async () => {
    const { outcome } = await check([failure(404, {}, 'Not Found')]);
    expect(outcome.kind).toBe('ok');
    expect(outcome.kind === 'ok' && outcome.notes?.join('\n')).toContain(DELIVERY_CONTRACT_PATH);
    expect(outcome.kind === 'ok' && outcome.notes?.join('\n')).toContain('NOT');
  });

  it('does not retry a 404 on the contract file', async () => {
    const { calls } = await check([failure(404, {}, 'Not Found')]);
    expect(calls.filter((url) => url.includes(DELIVERY_CONTRACT_PATH))).toHaveLength(1);
  });

  it('still treats an unreadable contract file as unreachable, not as absent', async () => {
    const { outcome } = await check([
      failure(403, { 'x-ratelimit-remaining': '0', 'x-ratelimit-limit': '5000' }, 'API rate limit exceeded'),
      failure(403, { 'x-ratelimit-remaining': '0', 'x-ratelimit-limit': '5000' }, 'API rate limit exceeded'),
      failure(403, { 'x-ratelimit-remaining': '0', 'x-ratelimit-limit': '5000' }, 'API rate limit exceeded'),
    ]);
    expect(outcome.kind).toBe('unreachable');
    expect(outcome.kind === 'unreachable' && outcome.reason).toContain(DELIVERY_CONTRACT_PATH);
  });
});
