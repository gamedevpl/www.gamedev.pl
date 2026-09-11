import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { runGate, type GateRunnerDeps, failedOnlyOnTrace } from './gate-runner.js';
import type { GamesStore, VersionManifest } from './games-store.js';

const MANIFEST: VersionManifest = {
  slug: 'comet-courier',
  version: 'v1',
  createdAt: '2026-07-30T10:00:00Z',
  jobId: 1_000_001,
  engineRef: 'abc123',
  sourceFiles: ['SPEC.md', 'index.html', 'game.ts'],
};

function stubStore(overrides: Partial<GamesStore> = {}) {
  const derived: Array<{ name: string; bytes: number; body: Buffer }> = [];
  const store = {
    getManifest: async () => MANIFEST,
    getSourceFile: async (_slug: string, _version: string, filePath: string) => `contents of ${filePath}`,
    putDerivedArtifact: async (_s: string, _v: string, name: string, body: Buffer) => {
      derived.push({ name, bytes: body.length, body });
    },
    putCandidateSources: vi.fn(),
    putGateResult: vi.fn(),
    getDerivedArtifact: async () => null,
    getKitRegistry: async () => null,
    ...overrides,
  } as unknown as GamesStore;
  return { store, derived };
}

async function harnessDir() {
  return mkdtemp(path.join(tmpdir(), 'gate-'));
}

/**
 * Stands in for the real assembler, which needs a full games-repo tree (GAME.json, the
 * GameKit modules it imports, esbuild) that these fixtures deliberately do not have.
 * What the real one produces is covered where it lives; what matters here is that the
 * gate stores its output rather than the repo's build.
 */
const stubAssemble: NonNullable<GateRunnerDeps['assembleBundle']> = async () => '<!doctype html>assembled';

describe('runGate', () => {
  it('materializes the candidate into the harness and runs the full check', async () => {
    const harness = await harnessDir();
    const { store } = stubStore();
    // Asserted from inside the run, because the harness game directory is cleaned up
    // afterwards — checking it later would be checking the cleanup, not the setup.
    let sourcesSeenByCheck: string | null = null;
    const run = vi.fn(async () => {
      sourcesSeenByCheck = await readFile(path.join(harness, 'games/comet-courier/game.ts'), 'utf8');
      return { code: 0, output: 'all good' };
    });

    const outcome = await runGate('comet-courier', 'v1', {
      store,
      prepareHarness: async () => harness,
      run,
      assembleBundle: stubAssemble,
    });

    expect(outcome.green).toBe(true);
    expect(sourcesSeenByCheck).toBe('contents of game.ts');
    expect(run).toHaveBeenCalledWith(
      'npm',
      ['run', 'check:game', '--', 'comet-courier'],
      harness,
      expect.objectContaining({ onChunk: expect.any(Function) }),
    );
  });

  it('reports preparing and check:game stage banners via onProgress', async () => {
    const harness = await harnessDir();
    const { store } = stubStore();
    const progress: string[] = [];
    const run = vi.fn(async (_c: string, args: string[], _cwd: string, options?: { onChunk?: (t: string) => void }) => {
      if (args.includes('check:game')) {
        options?.onChunk?.('\n=== typecheck (comet-courier) ===\n');
        options?.onChunk?.('\n=== smoke (comet-courier) ===\n');
      }
      return { code: 0, output: 'ok' };
    });

    await runGate(
      'comet-courier',
      'v1',
      {
        store,
        prepareHarness: async () => harness,
        run,
        assembleBundle: stubAssemble,
        onProgress: (p) => {
          progress.push(p.stage);
        },
      },
      { preview: true },
    );

    expect(progress[0]).toBe('preparing');
    expect(progress).toContain('typecheck');
    expect(progress).toContain('smoke');
  });

  it('checks the delivered behavioural golden instead of re-recording it', async () => {
    // `--accept` re-records TRACE.json rather than diffing against it, which would make
    // the trace stage pass unconditionally and retire the one check that catches a game
    // behaving differently on our engine than it did on the agent's.
    const { store } = stubStore();
    const run = vi.fn(async () => ({ code: 0, output: '' }));

    await runGate('comet-courier', 'v1', { store, prepareHarness: harnessDir, run, assembleBundle: stubAssemble });

    // Addressed by content, not by index: the runner also shells out for bookkeeping
    // (`git rev-parse`), and the check invocation is the one this is about.
    const check = run.mock.calls.find(([command]) => command === 'npm');
    expect(check?.[1]).not.toContain('--accept');
  });

  it('derives and persists the golden for a sealed preview, which carries none', async () => {
    // A seal promotes preview-lane sources, and no preview-lane agent can record a
    // golden — the harness that does it is not in their sandbox. Without deriving one
    // the trace stage has nothing to replay and the version is unpublishable forever.
    const { store, derived } = stubStore({
      getManifest: async () => ({ ...MANIFEST, origin: 'seal' as const }),
    });
    const run = vi.fn(async (command: string, args: string[], cwd: string) => {
      if (command === 'npm' && args.includes('trace')) {
        // What `npm run trace -- --accept` actually leaves behind.
        await mkdir(path.join(cwd, 'games/comet-courier'), { recursive: true });
        await writeFile(path.join(cwd, 'games/comet-courier/TRACE.json'), '{"samples":[]}');
      }
      return { code: 0, output: '' };
    });

    const outcome = await runGate('comet-courier', 'v1', {
      store,
      prepareHarness: harnessDir,
      run,
      assembleBundle: stubAssemble,
    });

    const traceCall = run.mock.calls.find(
      ([command, args]) => command === 'npm' && (args as string[]).includes('trace'),
    );
    expect(traceCall?.[1]).toContain('--accept');
    expect(outcome.green).toBe(true);
    expect(outcome.derivedSourceFiles).toEqual(['TRACE.json']);
    expect(derived.some((artifact) => artifact.name === 'source/TRACE.json')).toBe(true);
  });

  it('refuses green when the derived golden cannot be persisted', async () => {
    // Best-effort here would leave a publishable version with no durable golden on a
    // transient store failure — worse than the refusal this replaces.
    const { store } = stubStore({
      getManifest: async () => ({ ...MANIFEST, origin: 'seal' as const }),
      putDerivedArtifact: async () => {
        throw new Error('store unavailable');
      },
    });
    const run = vi.fn(async (command: string, args: string[], cwd: string) => {
      if (command === 'npm' && args.includes('trace')) {
        await mkdir(path.join(cwd, 'games/comet-courier'), { recursive: true });
        await writeFile(path.join(cwd, 'games/comet-courier/TRACE.json'), '{"samples":[]}');
      }
      return { code: 0, output: '' };
    });

    const outcome = await runGate('comet-courier', 'v1', {
      store,
      prepareHarness: harnessDir,
      run,
      assembleBundle: stubAssemble,
    });

    expect(outcome.green).toBe(false);
    expect(outcome.report).toContain('store unavailable');
  });

  it('preview lane runs check:game --preview and stores only preview.html', async () => {
    const harness = await harnessDir();
    const { store, derived } = stubStore();
    const run = vi.fn(async (command: string, args: string[]) => {
      if (command === 'npm' && args.includes('check:game')) {
        return { code: 0, output: 'preview ok' };
      }
      return { code: 0, output: 'deadbeef' };
    });

    const outcome = await runGate(
      'comet-courier',
      'v1',
      { store, prepareHarness: async () => harness, run, assembleBundle: stubAssemble },
      { preview: true },
    );

    expect(outcome.green).toBe(true);
    // Stills ride along by default (BY-28a): the preview build already installs Chrome,
    // and an agent that cannot run the game has no other evidence its canvas drew.
    expect(run).toHaveBeenCalledWith(
      'npm',
      ['run', 'check:game', '--', 'comet-courier', '--preview', '--preview-stills'],
      harness,
      expect.objectContaining({ onChunk: expect.any(Function) }),
    );
    // This harness has no media directory, so nothing was captured — and the lane is
    // unchanged by that. The invariant that matters is unmoved: never bundle.html.
    expect(derived.map((d) => d.name)).toEqual(['preview.html']);
    expect(outcome.artifacts).toEqual(['preview.html']);
    expect(outcome.artifacts).not.toContain('bundle.html');
  });

  it('fails the preview lane rather than reporting green with nothing servable', async () => {
    // arena-brawlers, 2026-08-09: preview check passed, assembler threw.
    const { store, derived } = stubStore();
    const run = vi.fn(async (command: string, args: string[]) =>
      command === 'npm' && args.includes('check:game')
        ? { code: 0, output: 'preview ok' }
        : { code: 0, output: 'deadbeef' },
    );

    const outcome = await runGate(
      'comet-courier',
      'v1',
      {
        store,
        prepareHarness: harnessDir,
        run,
        assembleBundle: async () => {
          throw new Error('game manifest engine modules are duplicated or out of order');
        },
      },
      { preview: true },
    );

    expect(outcome.green).toBe(false);
    expect(outcome.report).toContain('duplicated or out of order');
    expect(outcome.artifacts).toEqual([]);
    expect(derived).toEqual([]);
  });

  it('drops preview stills when GATE_PREVIEW_STILLS=0, without touching the lane', async () => {
    // A kill switch that needs no deploy: if the spend or the wall clock ever looks
    // wrong, this stops the capture and still leaves a working preview verdict.
    const harness = await harnessDir();
    const { store } = stubStore();
    const run = vi.fn(async (command: string, args: string[]) =>
      command === 'npm' && args.includes('check:game')
        ? { code: 0, output: 'preview ok' }
        : { code: 0, output: 'deadbeef' },
    );
    const previous = process.env.GATE_PREVIEW_STILLS;
    process.env.GATE_PREVIEW_STILLS = '0';
    try {
      const outcome = await runGate(
        'comet-courier',
        'v1',
        { store, prepareHarness: async () => harness, run, assembleBundle: stubAssemble },
        { preview: true },
      );
      expect(outcome.green).toBe(true);
      expect(run).toHaveBeenCalledWith(
        'npm',
        ['run', 'check:game', '--', 'comet-courier', '--preview'],
        harness,
        expect.objectContaining({ onChunk: expect.any(Function) }),
      );
    } finally {
      if (previous === undefined) delete process.env.GATE_PREVIEW_STILLS;
      else process.env.GATE_PREVIEW_STILLS = previous;
    }
  });

  it('reports the engine commit it actually checked against, from the harness itself', async () => {
    const { store } = stubStore();
    const run = vi.fn(async (command: string) =>
      command === 'git' ? { code: 0, output: 'deadbeefcafe\n' } : { code: 0, output: 'ok' },
    );

    const outcome = await runGate('comet-courier', 'v1', {
      store,
      prepareHarness: harnessDir,
      run,
      assembleBundle: stubAssemble,
    });

    expect(outcome.engineCommit).toBe('deadbeefcafe');
    // The sha is in the report too, so a verdict read by a human names the target.
    expect(outcome.report).toContain('deadbeefcafe');
  });

  it('checks against the manifest pin by default, and the override when asked', async () => {
    const { store } = stubStore();
    const seen: string[] = [];
    const prepareHarness = async (engineRef: string) => {
      seen.push(engineRef);
      return harnessDir();
    };
    const run = vi.fn(async () => ({ code: 0, output: 'ok' }));

    await runGate('comet-courier', 'v1', { store, prepareHarness, run, assembleBundle: stubAssemble });
    // A health run's whole question is "does it work on *today's* engine", so the pin —
    // which exists to keep the acceptance verdict reproducible — is exactly what it
    // must ignore.
    await runGate(
      'comet-courier',
      'v1',
      { store, prepareHarness, run, assembleBundle: stubAssemble },
      {
        engineRef: 'main',
      },
    );

    expect(seen).toEqual(['abc123', 'main']);
  });

  it('still renders a verdict when the sha cannot be resolved', async () => {
    // The commit is bookkeeping; the check is the verdict. Failing the run because
    // `git rev-parse` failed would discard an answer we already paid for.
    const { store } = stubStore();
    const run = vi.fn(async (command: string) =>
      command === 'git' ? { code: 128, output: 'not a repository' } : { code: 0, output: 'ok' },
    );

    const outcome = await runGate('comet-courier', 'v1', {
      store,
      prepareHarness: harnessDir,
      run,
      assembleBundle: stubAssemble,
    });

    expect(outcome.green).toBe(true);
    expect(outcome.engineCommit).toBeUndefined();
  });

  it('runs against the engine the version was built for, not whatever is current', async () => {
    // A green verdict has to mean "green against a known engine". Silently checking
    // against a moving harness would change what the verdict claims.
    const { store } = stubStore();
    const prepareHarness = vi.fn(async () => harnessDir());

    await runGate('comet-courier', 'v1', {
      store,
      prepareHarness,
      run: async () => ({ code: 0, output: '' }),
      assembleBundle: stubAssemble,
    });

    expect(prepareHarness).toHaveBeenCalledWith('abc123');
  });

  it('reports the tail of a failing run, where the failing check names itself', async () => {
    const { store } = stubStore();
    const output = `${'noise\n'.repeat(2000)}validate: Check 4 exceeded the byte budget`;

    const outcome = await runGate('comet-courier', 'v1', {
      store,
      prepareHarness: harnessDir,
      run: async () => ({ code: 1, output }),
      assembleBundle: stubAssemble,
    });

    expect(outcome.green).toBe(false);
    expect(outcome.report).toContain('Check 4 exceeded the byte budget');
    expect(outcome.report.length).toBeLessThan(4200);
  });

  it('leaves a playable preview when the check fails, but never a bundle', async () => {
    // Both halves matter and they pull against each other. A red run must not leave a
    // `bundle.html` behind that a later step could mistake for verified output — but it
    // must leave *something*, because the creator's draft preview serves a gate artifact
    // and storing nothing is what turned a failed check into a studio panel that showed
    // an empty box and explained nothing.
    const { store, derived } = stubStore();

    const outcome = await runGate('comet-courier', 'v1', {
      store,
      prepareHarness: harnessDir,
      run: async () => ({ code: 1, output: 'failed' }),
      assembleBundle: stubAssemble,
    });

    expect(outcome.green).toBe(false);
    expect(derived.map((entry) => entry.name)).toEqual(['preview.html']);
    expect(outcome.artifacts).toEqual(['preview.html']);
  });

  it('still returns a red verdict when capture media upload fails', async () => {
    // Optional screenshots must not discard the actionable report (Codex P1).
    const harness = await harnessDir();
    const { store } = stubStore({
      putDerivedArtifact: async (_s, _v, name) => {
        if (name.startsWith('media/')) throw new Error('GCS unavailable');
      },
    });

    const outcome = await runGate('comet-courier', 'v1', {
      store,
      prepareHarness: async () => harness,
      assembleBundle: stubAssemble,
      run: async () => {
        await mkdir(path.join(harness, 'games/comet-courier/media'), { recursive: true });
        await writeFile(path.join(harness, 'games/comet-courier/media/opening.png'), 'png-bytes');
        return { code: 1, output: 'Check 12: capture diverged' };
      },
    });

    expect(outcome.green).toBe(false);
    expect(outcome.report).toContain('capture diverged');
    expect(outcome.artifacts).toEqual(['preview.html']);
  });

  it('reports a red verdict even when the candidate cannot be assembled at all', async () => {
    // The common case for "no preview": sources that fail the check precisely because
    // they do not assemble. The verdict is still the answer, and a gate that crashed
    // while trying to be helpful would replace a reported failure with no report.
    const { store, derived } = stubStore();

    const outcome = await runGate('comet-courier', 'v1', {
      store,
      prepareHarness: harnessDir,
      run: async () => ({ code: 1, output: 'validate: Check 4 exceeded the byte budget' }),
      assembleBundle: async () => {
        throw new Error('credential found in bundle');
      },
    });

    expect(outcome.green).toBe(false);
    expect(outcome.report).toContain('Check 4');
    expect(derived).toEqual([]);
  });

  it('stores the bundle and media the check produced', async () => {
    const harness = await harnessDir();
    const { store, derived } = stubStore();
    // The capture harness writes these during the run, which is exactly why they are the
    // verified artifacts: they did not exist before the check and were not uploaded.
    const outcome = await runGate('comet-courier', 'v1', {
      store,
      prepareHarness: async () => harness,
      assembleBundle: stubAssemble,
      run: async () => {
        await mkdir(path.join(harness, 'games/comet-courier/media'), { recursive: true });
        await writeFile(path.join(harness, 'games/comet-courier/media/opening.png'), 'png-bytes');
        await writeFile(path.join(harness, 'games/comet-courier/media/gameplay.mp4'), 'mp4-bytes');
        await writeFile(path.join(harness, 'games/comet-courier/media/notes.txt'), 'ignored');
        return { code: 0, output: '' };
      },
    });

    // The artifacts that ship are the ones this run produced, not ones an agent sent.
    expect(derived.map((entry) => entry.name).sort()).toEqual([
      'bundle.html',
      'media/gameplay.mp4',
      'media/opening.png',
    ]);
    expect(outcome.artifacts).toContain('bundle.html');
    expect(outcome.screenshot).toBe('media/opening.png');
  });

  it('refuses a delivery whose kitEngineRef is outside kits/current.json', async () => {
    const prepareHarness = vi.fn(async () => harnessDir());
    const run = vi.fn(async () => ({ code: 0, output: '' }));
    const { store } = stubStore({
      getManifest: async () => ({
        ...MANIFEST,
        kitEngineRef: 'cccccccccccccccccccccccccccccccccccccccc',
      }),
    });

    const outcome = await runGate('comet-courier', 'v1', {
      store,
      prepareHarness,
      run,
      assembleBundle: stubAssemble,
      readKitRegistry: async () => ({
        current: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        previous: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        updatedAt: '2026-07-31T12:00:00.000Z',
      }),
    });

    expect(outcome).toMatchObject({ green: false, status: 'kit_outdated' });
    expect(outcome.report).toMatch(/^kit_outdated:/);
    expect(outcome.report).toContain('cccccccccccccccccccccccccccccccccccccccc');
    // No harness, no check:game — the window refusal is the whole verdict.
    expect(prepareHarness).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });

  it('accepts a kitEngineRef that is the registry previous (N−1)', async () => {
    const previous = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
    const { store } = stubStore({
      getManifest: async () => ({ ...MANIFEST, kitEngineRef: previous }),
    });
    const run = vi.fn(async () => ({ code: 0, output: '' }));

    const outcome = await runGate('comet-courier', 'v1', {
      store,
      prepareHarness: harnessDir,
      run,
      assembleBundle: stubAssemble,
      readKitRegistry: async () => ({
        current: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        previous,
        updatedAt: '2026-07-31T12:00:00.000Z',
      }),
    });

    expect(outcome.green).toBe(true);
    expect(outcome.status).toBeUndefined();
    expect(run).toHaveBeenCalled();
  });

  it('accepts a two-generations-old kit when it shares the current major', async () => {
    // The case that cost three consecutive rounds: seven kits landed in ten hours, so
    // the agent's ref was out of N/N−1 by the time it submitted. Nothing about those
    // merges could break a game, and now nothing about them refuses one.
    const old = 'cccccccccccccccccccccccccccccccccccccccc';
    const { store } = stubStore({ getManifest: async () => ({ ...MANIFEST, kitEngineRef: old }) });
    const run = vi.fn(async () => ({ code: 0, output: '' }));
    const readKitVersion = vi.fn(async () => '1.0.0');

    const outcome = await runGate('comet-courier', 'v1', {
      store,
      prepareHarness: harnessDir,
      run,
      assembleBundle: stubAssemble,
      readKitRegistry: async () => ({
        current: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        previous: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        currentVersion: '1.4.2',
        updatedAt: '2026-08-05T11:48:00.000Z',
      }),
      readKitVersion,
    });

    expect(outcome.green).toBe(true);
    expect(outcome.status).toBeUndefined();
    expect(readKitVersion).toHaveBeenCalledWith(old);
    expect(run).toHaveBeenCalled();
  });

  it('still refuses a delivery from a previous major', async () => {
    // A major bump means existing creator sources no longer compile — the one case the
    // window exists to catch, and widening must not swallow it.
    const old = 'cccccccccccccccccccccccccccccccccccccccc';
    const { store } = stubStore({ getManifest: async () => ({ ...MANIFEST, kitEngineRef: old }) });
    const prepareHarness = vi.fn(async () => harnessDir());
    const run = vi.fn(async () => ({ code: 0, output: '' }));

    const outcome = await runGate('comet-courier', 'v1', {
      store,
      prepareHarness,
      run,
      assembleBundle: stubAssemble,
      readKitRegistry: async () => ({
        current: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        previous: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        currentVersion: '2.0.0',
        updatedAt: '2026-08-05T11:48:00.000Z',
      }),
      readKitVersion: async () => '1.4.2',
    });

    expect(outcome).toMatchObject({ green: false, status: 'kit_outdated' });
    expect(outcome.report).toContain('current kit is v2.0.0');
    expect(prepareHarness).not.toHaveBeenCalled();
  });

  it('does not spend a sidecar read when the registry is unversioned or the ref is current', async () => {
    // The common paths must cost nothing extra, and an unversioned registry cannot
    // compare majors — reading would buy only latency.
    const readKitVersion = vi.fn(async () => '1.0.0');
    const current = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const { store } = stubStore({ getManifest: async () => ({ ...MANIFEST, kitEngineRef: current }) });
    await runGate('comet-courier', 'v1', {
      store,
      prepareHarness: harnessDir,
      run: async () => ({ code: 0, output: '' }),
      assembleBundle: stubAssemble,
      readKitRegistry: async () => ({ current, previous: null, currentVersion: '1.4.2', updatedAt: 'x' }),
      readKitVersion,
    });
    expect(readKitVersion).not.toHaveBeenCalled();

    const { store: store2 } = stubStore({
      getManifest: async () => ({ ...MANIFEST, kitEngineRef: 'cccccccccccccccccccccccccccccccccccccccc' }),
    });
    await runGate('comet-courier', 'v1', {
      store: store2,
      prepareHarness: harnessDir,
      run: async () => ({ code: 0, output: '' }),
      assembleBundle: stubAssemble,
      readKitRegistry: async () => ({ current, previous: null, updatedAt: 'x' }),
      readKitVersion,
    });
    expect(readKitVersion).not.toHaveBeenCalled();
  });

  it('serves the assembler’s document, not the games repo’s own build output', async () => {
    // The repo's `dist/` build is its idea of a playable page. Serve-time policy — the
    // restrictive CSP, the provenance marking, the credential scan, the byte budget —
    // lives in `assembleGameHtml` and in none of that output, so storing the build was
    // storing a document with none of it.
    const harness = await harnessDir();
    const { store, derived } = stubStore();

    await runGate('comet-courier', 'v1', {
      store,
      prepareHarness: async () => harness,
      assembleBundle: async () => '<!doctype html><meta name="ai-provenance" content="x" />assembled',
      run: async () => {
        await mkdir(path.join(harness, 'dist/games/comet-courier'), { recursive: true });
        await writeFile(path.join(harness, 'dist/games/comet-courier/index.html'), 'repo build output');
        return { code: 0, output: '' };
      },
    });

    const bundle = derived.find((entry) => entry.name === 'bundle.html');
    expect(bundle?.body.toString('utf8')).toContain('assembled');
    expect(bundle?.body.toString('utf8')).not.toContain('repo build output');
  });

  it('fails the gate when a checked game cannot be assembled into a servable document', async () => {
    // The assembler refuses things `check:game` accepts — a credential-like string is
    // the case that matters. That has to be a red verdict with a reason, not a crash:
    // a run that dies leaves the version with no verdict, which reads as a gate that
    // never ran rather than one that said no.
    const { store, derived } = stubStore();

    const outcome = await runGate('comet-courier', 'v1', {
      store,
      prepareHarness: harnessDir,
      run: async () => ({ code: 0, output: '' }),
      assembleBundle: async () => {
        throw new Error('generated project contains credential-like strings');
      },
    });

    expect(outcome.green).toBe(false);
    expect(outcome.report).toContain('credential-like strings');
    // Nothing servable was stored, and the verdict is recorded rather than thrown.
    expect(derived.find((entry) => entry.name === 'bundle.html')).toBeUndefined();
  });

  it('fails the gate rather than passing a version with nothing to serve', async () => {
    const { store } = stubStore();

    const outcome = await runGate('comet-courier', 'v1', {
      store,
      prepareHarness: harnessDir,
      run: async () => ({ code: 0, output: '' }),
      assembleBundle: async () => null,
    });

    expect(outcome.green).toBe(false);
    expect(outcome.report).toContain('could not be assembled');
  });

  it('refuses a version that does not exist rather than checking nothing and passing', async () => {
    const { store } = stubStore({ getManifest: async () => null });

    const outcome = await runGate('comet-courier', 'v9', {
      store,
      prepareHarness: harnessDir,
      run: async () => ({ code: 0, output: '' }),
      assembleBundle: stubAssemble,
    });

    expect(outcome.green).toBe(false);
    expect(outcome.report).toContain('no such version');
  });

  it('fails loudly when a version claims a file it never stored', async () => {
    // Silent omission would let a game be checked without one of its own sources.
    const { store } = stubStore({ getSourceFile: async () => null });

    await expect(
      runGate('comet-courier', 'v1', {
        store,
        prepareHarness: harnessDir,
        run: async () => ({ code: 0, output: '' }),
        assembleBundle: stubAssemble,
      }),
    ).rejects.toThrow(/which is not stored/);
  });

  it('does not publish anything — it only records a verdict', async () => {
    // Publishing on green would delete the human review that is the moderation boundary.
    const { store } = stubStore();
    const deps: GateRunnerDeps = {
      store,
      prepareHarness: harnessDir,
      run: async () => ({ code: 0, output: '' }),
      assembleBundle: stubAssemble,
    };

    await runGate('comet-courier', 'v1', deps);

    expect(
      (store as unknown as { putCandidateSources: ReturnType<typeof vi.fn> }).putCandidateSources,
    ).not.toHaveBeenCalled();
  });
});

describe('failedOnlyOnTrace', () => {
  it('recognises the trace stage refusing a changed golden', () => {
    expect(failedOnlyOnTrace('replaying TRACE.json\nTRACE.json differs from the committed golden')).toBe(true);
  });

  it('refuses to shortcut when another stage also failed', () => {
    // The one mistake this must not make: handing a reviewer a red game with a green
    // badge because the output happened to mention the trace somewhere.
    expect(failedOnlyOnTrace('typecheck failed: TS2345\nTRACE.json differs from the golden')).toBe(false);
    expect(failedOnlyOnTrace('TRACE.json changed\nplaytest failed: never reached lap 3')).toBe(false);
  });

  it('is not fooled by a run that merely mentions the trace', () => {
    expect(failedOnlyOnTrace('replayed TRACE.json: 0 differences\nvalidate failed: Check 9')).toBe(false);
    expect(failedOnlyOnTrace('smoke error: page did not load')).toBe(false);
  });

  it('needs both the stage and a difference — naming the file alone is not enough', () => {
    expect(failedOnlyOnTrace('wrote TRACE.json')).toBe(false);
  });
});
