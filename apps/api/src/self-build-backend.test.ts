import { describe, expect, it, vi } from 'vitest';
import type { SeedFiles } from './agent-backend.js';
import { createSelfBuildBackend, parseSelfBuildRef, selfBuildRef } from './self-build-backend.js';

const seed: SeedFiles = {
  slug: 'demo',
  files: [{ path: 'SPEC.md', content: '# Demo\n' }],
  references: ['other'],
};

describe('createSelfBuildBackend', () => {
  it('dispatches a self ref with no external call and persists the seed', async () => {
    const persistSeed = vi.fn(async () => {});
    const backend = createSelfBuildBackend({ persistSeed });

    const result = await backend.dispatch({
      issueNumber: 1001,
      spec: 'a game',
      channelToken: 'tok',
      apiBaseUrl: 'https://example.test',
      seed,
    });

    expect(backend.name).toBe('self');
    expect(result).toEqual({ ref: 'self:1001' });
    expect(persistSeed).toHaveBeenCalledWith(1001, seed);
  });

  it('resume reuses a stored seed instead of persisting again', async () => {
    const persistSeed = vi.fn(async () => {});
    const readSeed = vi.fn(async () => seed);
    const backend = createSelfBuildBackend({ persistSeed, readSeed });

    const result = await backend.resume(
      {
        issueNumber: 7,
        spec: 'feedback',
        feedback: 'make it louder',
        channelToken: 'tok',
        apiBaseUrl: 'https://example.test',
        seed: { ...seed, notes: 'fresh' },
      },
      { ref: 'self:7' },
    );

    expect(result.ref).toBe('self:7');
    expect(readSeed).toHaveBeenCalledWith(7);
    expect(persistSeed).not.toHaveBeenCalled();
  });

  it('observe projects channel signals with no external reads', async () => {
    const readSignals = vi.fn(async () => ({ lastAgentSignalAt: '2026-07-31T12:00:00Z' }));
    const backend = createSelfBuildBackend({ readSignals });

    await expect(backend.observe('self:3', { hasCandidate: false })).resolves.toEqual({
      state: 'in_progress',
      hasCandidate: false,
    });
    await expect(backend.observe('self:3', { hasCandidate: true })).resolves.toEqual({
      state: 'completed',
      hasCandidate: true,
    });
    readSignals.mockResolvedValueOnce({});
    await expect(backend.observe('self:3', { hasCandidate: false })).resolves.toEqual({
      state: 'queued',
      hasCandidate: false,
    });
  });

  it('cancel is cooperative', async () => {
    const backend = createSelfBuildBackend();
    await expect(backend.cancel('self:1')).resolves.toEqual({ enforced: false });
  });

  it('parses self refs', () => {
    expect(selfBuildRef(42)).toBe('self:42');
    expect(parseSelfBuildRef('self:42')).toBe(42);
    expect(parseSelfBuildRef('copilot:abc')).toBeNull();
  });
});
