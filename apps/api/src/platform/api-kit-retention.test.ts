import { describe, expect, it } from 'vitest';
import { selectKitsToPrune, type KitCandidate } from './api-kit-retention.js';

describe('selectKitsToPrune', () => {
  const current = 'a'.repeat(40);
  const previous = 'b'.repeat(40);
  const recent = 'c'.repeat(40);
  const oldMinorLatest = 'd'.repeat(40);
  const oldMinorObsolete = 'e'.repeat(40);
  const obsoleteCurrentMinor = 'f'.repeat(40);

  const now = new Date('2026-10-31T12:00:00Z').getTime();

  const sidecars: Record<string, KitCandidate> = {
    [current]: { engineRef: current, version: '1.11.2', packedAt: '2026-10-31T00:00:00Z' },
    [previous]: { engineRef: previous, version: '1.11.1', packedAt: '2026-10-30T00:00:00Z' },
    [recent]: { engineRef: recent, version: '1.11.2', packedAt: '2026-10-25T00:00:00Z' }, // 6 days ago (< 14d)
    [oldMinorLatest]: { engineRef: oldMinorLatest, version: '1.2.0', packedAt: '2026-08-27T12:00:00Z' }, // latest for 1.2
    [oldMinorObsolete]: { engineRef: oldMinorObsolete, version: '1.2.0', packedAt: '2026-08-25T12:00:00Z' }, // older for 1.2
    [obsoleteCurrentMinor]: { engineRef: obsoleteCurrentMinor, version: '1.11.0', packedAt: '2026-09-01T00:00:00Z' }, // older for 1.11
  };

  it('preserves current and previous registry kits unconditionally', () => {
    const result = selectKitsToPrune({
      current,
      previous,
      sidecars,
      retentionDays: 14,
      now,
    });
    expect(result.keep.has(current)).toBe(true);
    expect(result.keep.has(previous)).toBe(true);
  });

  it('preserves recent kits within retention window and minor version archetypes', () => {
    const result = selectKitsToPrune({
      current,
      previous,
      sidecars,
      retentionDays: 14,
      now,
    });
    expect(result.keep.has(recent)).toBe(true);
    expect(result.keep.has(oldMinorLatest)).toBe(true);
    expect(result.prune).toContain(oldMinorObsolete);
    expect(result.prune).toContain(obsoleteCurrentMinor);
  });

  it('respects custom retention days', () => {
    const result = selectKitsToPrune({
      current,
      previous,
      sidecars,
      retentionDays: 2,
      now,
    });
    expect(result.prune).toContain(recent);
  });

  it('preserves unparseable candidates lacking version or packedAt', () => {
    const corrupt1 = '1'.repeat(40);
    const corrupt2 = '2'.repeat(40);
    const corrupt3 = '3'.repeat(40);
    const result = selectKitsToPrune({
      current,
      previous,
      sidecars: {
        ...sidecars,
        [corrupt1]: { engineRef: corrupt1 },
        [corrupt2]: { engineRef: corrupt2, version: '1.2.0' },
        [corrupt3]: { engineRef: corrupt3, packedAt: '2026-08-01T00:00:00Z' },
      },
      retentionDays: 14,
      now,
    });
    expect(result.keep.has(corrupt1)).toBe(true);
    expect(result.keep.has(corrupt2)).toBe(true);
    expect(result.keep.has(corrupt3)).toBe(true);
    expect(result.prune).not.toContain(corrupt1);
    expect(result.prune).not.toContain(corrupt2);
    expect(result.prune).not.toContain(corrupt3);
  });
});
