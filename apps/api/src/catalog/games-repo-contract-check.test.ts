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
  EDITOR_CONTRACT_PATH,
  GAME_KIT_MODULES,
  GAME_KIT_VERTICAL_ENTRIES,
  MAX_PROJECT_BYTES,
  TS_ANY_SCAN_PATH,
} from '../platform/games-repo-contract.js';

/** Deliberately different header prose — proves only the code below it must match. */
const EDITOR_CONTRACT_CODE = `export const EDITOR_FILE = 'EDITOR.json';\nexport function noop() {}\n`;
const EDITOR_CONTRACT_REMOTE = `/**\n * The editor content contract — L0 of EditorKit.\n */\n\n${EDITOR_CONTRACT_CODE}`;
const EDITOR_CONTRACT_LOCAL = `/**\n * MIRROR of the games repo's tools/lib/editor-contract.ts.\n */\n\n${EDITOR_CONTRACT_CODE}`;

/** Same arrangement for the `any` scan: shared code, headers free to differ. */
const TS_ANY_SCAN_CODE = `export function findBannedAnyUsages() {\n  return [];\n}\n`;
const TS_ANY_SCAN_REMOTE = `/**\n * The scan behind validate Check 37.\n */\n\n${TS_ANY_SCAN_CODE}`;
const TS_ANY_SCAN_LOCAL = `/**\n * MIRROR of the games repo's tools/lib/ts-any-scan.ts.\n */\n\n${TS_ANY_SCAN_CODE}`;

const VERTICALS_SOURCE = `
  const GAME_KIT_VERTICALS = Object.freeze({
${Object.entries(GAME_KIT_VERTICAL_ENTRIES)
  .map(([name, entry]) => `    ${name}: '${entry}',`)
  .join('\n')}
  });
`;

const ASSEMBLE_SOURCE = `
  const GAME_KIT_MODULES = [${GAME_KIT_MODULES.map((name) => `'${name}'`).join(', ')}];
  ${VERTICALS_SOURCE}
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

/** The four files the check reads, all in agreement. */
function agreeingPages(delivery: string | Response[] = deliverySource()): Record<string, Response[]> {
  return {
    'tools/lib/assemble.ts': [ok(ASSEMBLE_SOURCE)],
    'tools/validate.ts': [ok(VALIDATE_SOURCE)],
    [DELIVERY_CONTRACT_PATH]: typeof delivery === 'string' ? [ok(delivery)] : delivery,
    [EDITOR_CONTRACT_PATH]: [ok(EDITOR_CONTRACT_REMOTE)],
    [TS_ANY_SCAN_PATH]: [ok(TS_ANY_SCAN_REMOTE)],
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

const BASE = {
  repo: 'gamedevpl/www.gamedev.pl-games',
  ref: 'main',
  token: 't',
  sleep: async () => {},
  readLocalFile: (filePath: string) =>
    filePath.endsWith('ts-any-scan.ts') ? TS_ANY_SCAN_LOCAL : EDITOR_CONTRACT_LOCAL,
};

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
      ${VERTICALS_SOURCE}
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

  it('reports drift when a module moved to a vertical this side still reads from shared/modules', async () => {
    // The regression that broke the nightly bake: games-repo #527 promoted `vehicles` to
    // a vertical. Both sides still listed the name, so the module check stayed green while
    // the bake looked for shared/modules/vehicles.ts and reported the game as missing.
    const assembleWithNewVertical = ASSEMBLE_SOURCE.replace(
      "urban: 'shared/verticals/urban/index.ts',",
      "urban: 'shared/verticals/urban/index.ts',\n    actors: 'shared/verticals/actors/index.ts',",
    );
    const { fetchImpl } = createFetch({
      ...agreeingPages(),
      'tools/lib/assemble.ts': [ok(assembleWithNewVertical)],
    });

    const outcome = await runGamesRepoContractCheck({ ...BASE, fetchImpl });
    expect(outcome.kind).toBe('drift');
    expect(outcome.kind === 'drift' && outcome.reason).toContain('GAME_KIT_VERTICALS mismatch');
    expect(outcome.kind === 'drift' && outcome.reason).toContain('shared/modules/actors.ts');
  });

  it('reports drift when a shared vertical resolves to a different entry path', async () => {
    const movedEntry = ASSEMBLE_SOURCE.replace(
      "urban: 'shared/verticals/urban/index.ts',",
      "urban: 'shared/verticals/urban/entry.ts',",
    );
    const { fetchImpl } = createFetch({ ...agreeingPages(), 'tools/lib/assemble.ts': [ok(movedEntry)] });

    const outcome = await runGamesRepoContractCheck({ ...BASE, fetchImpl });
    expect(outcome.kind).toBe('drift');
    expect(outcome.kind === 'drift' && outcome.reason).toContain('shared/verticals/urban/entry.ts');
  });

  it('notes rather than fails when the games tip has no verticals literal to compare', async () => {
    const noVerticals = ASSEMBLE_SOURCE.replace(VERTICALS_SOURCE, '');
    const { fetchImpl } = createFetch({ ...agreeingPages(), 'tools/lib/assemble.ts': [ok(noVerticals)] });

    const outcome = await runGamesRepoContractCheck({ ...BASE, fetchImpl });
    expect(outcome.kind).toBe('ok');
    expect(outcome.kind === 'ok' && outcome.notes?.[0]).toContain('GAME_KIT_VERTICALS not compared');
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

describe('runGamesRepoContractCheck — editor-contract mirror', () => {
  it('passes when the code below the header matches, even though the header prose differs', async () => {
    const { fetchImpl } = createFetch(agreeingPages());
    await expect(runGamesRepoContractCheck({ ...BASE, fetchImpl })).resolves.toEqual({ kind: 'ok' });
  });

  it('reports drift when the games repo has code the website mirror lacks', async () => {
    const { fetchImpl } = createFetch({
      ...agreeingPages(),
      [EDITOR_CONTRACT_PATH]: [
        ok(
          EDITOR_CONTRACT_REMOTE.replace(
            'export function noop() {}',
            'export function noop() {}\nexport const uniqueBy = 1;',
          ),
        ),
      ],
    });

    const outcome = await runGamesRepoContractCheck({ ...BASE, fetchImpl });
    expect(outcome.kind).toBe('drift');
    expect(outcome.kind === 'drift' && outcome.reason).toContain('editor-contract mismatch');
    expect(outcome.kind === 'drift' && outcome.reason).toContain('first difference at offset');
  });

  it('reports drift when the website mirror has code the games repo lacks', async () => {
    const { fetchImpl } = createFetch(agreeingPages());

    const outcome = await runGamesRepoContractCheck({
      ...BASE,
      fetchImpl,
      readLocalFile: () =>
        EDITOR_CONTRACT_LOCAL.replace(
          'export function noop() {}',
          'export function noop() {}\nexport const extra = 1;',
        ),
    });
    expect(outcome.kind).toBe('drift');
    expect(outcome.kind === 'drift' && outcome.reason).toContain('editor-contract mismatch');
  });
});

describe('runGamesRepoContractCheck — ts-any-scan mirror', () => {
  it('reports drift when the two scans disagree', async () => {
    const { fetchImpl } = createFetch({
      ...agreeingPages(),
      [TS_ANY_SCAN_PATH]: [ok(TS_ANY_SCAN_REMOTE.replace('return [];', 'return [1];'))],
    });

    const outcome = await runGamesRepoContractCheck({ ...BASE, fetchImpl });
    expect(outcome.kind).toBe('drift');
    expect(outcome.kind === 'drift' && outcome.reason).toContain('ts-any-scan mismatch');
  });

  it('reports drift when the website mirror has code the games repo lacks', async () => {
    const { fetchImpl } = createFetch(agreeingPages());

    const outcome = await runGamesRepoContractCheck({
      ...BASE,
      fetchImpl,
      readLocalFile: (filePath: string) =>
        filePath.endsWith('ts-any-scan.ts') ? `${TS_ANY_SCAN_LOCAL}export const extra = 1;\n` : EDITOR_CONTRACT_LOCAL,
    });
    expect(outcome.kind).toBe('drift');
    expect(outcome.kind === 'drift' && outcome.reason).toContain('ts-any-scan mismatch');
  });

  it('tolerates the file being absent from the games tip, and says so', async () => {
    // The expected state while this side merges first: an observed absence, not a failed
    // read, so it must not read as agreement either.
    const { fetchImpl } = createFetch({ ...agreeingPages(), [TS_ANY_SCAN_PATH]: [failure(404)] });

    const outcome = await runGamesRepoContractCheck({ ...BASE, fetchImpl });
    expect(outcome.kind).toBe('ok');
    expect(outcome.kind === 'ok' && outcome.notes?.join('\n')).toContain(TS_ANY_SCAN_PATH);
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

  it('reports drift when a games-repo cap exceeds what this side accepts', async () => {
    // The failing direction: deliveries sized for the games-repo cap 400 at upload.
    expect(driftReason((await check(deliverySource({ maxFiles: DELIVERY_MAX_FILES + 50 }))).outcome)).toContain(
      'maxFiles',
    );
    expect(
      driftReason((await check(deliverySource({ maxUploadBytes: DELIVERY_MAX_UPLOAD_BYTES * 2 }))).outcome),
    ).toContain('maxUploadBytes');
  });

  it('passes with a note when this side accepts more than the games repo advertises', async () => {
    // A website-first cap raise. Inert for deliveries, and failing it would make the
    // documented safe merge order the one that reddens master — same asymmetry as the
    // fixed-file list.
    const { outcome } = await check(deliverySource({ maxUploadBytes: DELIVERY_MAX_UPLOAD_BYTES / 2 }));
    expect(outcome.kind).toBe('ok');
    expect((outcome as { notes?: string[] }).notes?.join('\n')).toContain('maxUploadBytes');
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
