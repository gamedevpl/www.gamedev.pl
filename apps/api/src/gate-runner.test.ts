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
  const derived: Array<{ name: string; bytes: number }> = [];
  const store = {
    getManifest: async () => MANIFEST,
    getSourceFile: async (_slug: string, _version: string, filePath: string) => `contents of ${filePath}`,
    putDerivedArtifact: async (_s: string, _v: string, name: string, body: Buffer) => {
      derived.push({ name, bytes: body.length });
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
    });

    expect(outcome.green).toBe(true);
    expect(sourcesSeenByCheck).toBe('contents of game.ts');
    expect(run).toHaveBeenCalledWith('npm', ['run', 'check:game', '--', 'comet-courier', '--accept'], harness);
  });

  it('runs against the engine the version was built for, not whatever is current', async () => {
    // A green verdict has to mean "green against a known engine". Silently checking
    // against a moving harness would change what the verdict claims.
    const { store } = stubStore();
    const prepareHarness = vi.fn(async () => harnessDir());

    await runGate('comet-courier', 'v1', { store, prepareHarness, run: async () => ({ code: 0, output: '' }) });

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

  it('stores nothing derived when the check fails', async () => {
    // A red run must not leave a bundle behind that a later step could mistake for
    // verified output.
    const { store, derived } = stubStore();

    await runGate('comet-courier', 'v1', {
      store,
      prepareHarness: harnessDir,
      run: async () => ({ code: 1, output: 'failed' }),
    });

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
      run: async () => {
        await mkdir(path.join(harness, 'dist/games/comet-courier'), { recursive: true });
        await writeFile(path.join(harness, 'dist/games/comet-courier/index.html'), '<!doctype html>');
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
