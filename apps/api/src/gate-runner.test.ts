import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { runGate, type GateRunnerDeps } from './gate-runner.js';
import type { GamesStore, VersionManifest } from './games-store.js';

const MANIFEST: VersionManifest = {
  slug: 'comet-courier',
  version: 'v1',
  createdAt: '2026-07-30T10:00:00Z',
  issueNumber: 1_000_001,
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
    expect(run).toHaveBeenCalledWith('npm', ['run', 'check:game', '--', 'comet-courier'], harness);
  });

  it('checks the delivered behavioural golden instead of re-recording it', async () => {
    // `--accept` re-records TRACE.json rather than diffing against it, which would make
    // the trace stage pass unconditionally and retire the one check that catches a game
    // behaving differently on our engine than it did on the agent's.
    const { store } = stubStore();
    const run = vi.fn(async () => ({ code: 0, output: '' }));

    await runGate('comet-courier', 'v1', { store, prepareHarness: harnessDir, run, assembleBundle: stubAssemble });

    expect(run.mock.calls[0]![1]).not.toContain('--accept');
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
      }),
    ).rejects.toThrow(/which is not stored/);
  });

  it('does not publish anything — it only records a verdict', async () => {
    // Publishing on green would delete the human review that is the moderation boundary.
    const { store } = stubStore();
    const deps: GateRunnerDeps = { store, prepareHarness: harnessDir, run: async () => ({ code: 0, output: '' }) };

    await runGate('comet-courier', 'v1', deps);

    expect(
      (store as unknown as { putCandidateSources: ReturnType<typeof vi.fn> }).putCandidateSources,
    ).not.toHaveBeenCalled();
  });
});
