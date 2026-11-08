import { describe, expect, it, vi } from 'vitest';
import { createSelfBuildBackend } from './self-build-backend.js';
import { publishedThisRound } from './self-build-signals.js';

describe('self rounds finish on their own publish only', () => {
  it('completes when this round published', async () => {
    const readSignals = vi.fn(async () => ({ deliveredVersion: 'v2', previewVersion: 'v2', roundDeliveryCount: 1 }));
    const backend = createSelfBuildBackend({ readSignals });
    await expect(backend.observe('self:3', { hasCandidate: true })).resolves.toEqual({
      state: 'completed',
      hasCandidate: true,
    });
  });

  it('does not finish a continuation on the delivery an earlier round made', async () => {
    const inherited = { lastAgentSignalAt: '2026-11-07T17:30:00Z', deliveredVersion: 'v5', previewVersion: 'v5' };
    const readSignals = vi.fn(async () => ({ ...inherited, roundDeliveryCount: 0 }));
    const backend = createSelfBuildBackend({ readSignals });
    await expect(backend.observe('self:3', { hasCandidate: true })).resolves.toEqual({
      state: 'in_progress',
      hasCandidate: false,
    });
    // A preview this round is not publish readiness either.
    readSignals.mockResolvedValueOnce({ ...inherited, previewVersion: 'v6', roundDeliveryCount: 1 });
    await expect(backend.observe('self:3', { hasCandidate: true })).resolves.toEqual({
      state: 'in_progress',
      hasCandidate: false,
    });
  });

  it('publishedThisRound needs a delivery this round that was a publish', () => {
    expect(publishedThisRound({ deliveredVersion: 'v1', previewVersion: 'v1', roundDeliveryCount: 0 })).toBe(false);
    expect(publishedThisRound({ deliveredVersion: 'v1', previewVersion: 'v2', roundDeliveryCount: 1 })).toBe(false);
    expect(publishedThisRound({ previewVersion: 'v2', roundDeliveryCount: 1 })).toBe(false);
    expect(publishedThisRound({ deliveredVersion: 'v2', previewVersion: 'v2', roundDeliveryCount: 1 })).toBe(true);
  });
});
