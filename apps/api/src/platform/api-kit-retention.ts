export type KitCandidate = {
  engineRef: string;
  version?: string;
  packedAt?: string;
};

export type PruneSelection = {
  keep: Set<string>;
  prune: string[];
};

export function selectKitsToPrune(options: {
  current: string;
  previous: string | null;
  sidecars: Record<string, KitCandidate>;
  retentionDays?: number;
  now?: number;
}): PruneSelection {
  const retentionDays = options.retentionDays ?? 14;
  const now = options.now ?? Date.now();
  const retentionMs = retentionDays * 24 * 60 * 60 * 1000;

  const keep = new Set<string>();
  if (options.current) keep.add(options.current);
  if (options.previous) keep.add(options.previous);

  // Preserve latest kit per minor line as archetype.
  const latestByMinor = new Map<string, KitCandidate>();
  for (const candidate of Object.values(options.sidecars)) {
    const v = candidate.version;
    const parts = v ? v.split('.') : null;
    const minorKey = parts && parts.length >= 2 ? `${parts[0]}.${parts[1]}` : (v ?? 'unknown');
    const existing = latestByMinor.get(minorKey);
    const date = candidate.packedAt ?? '';
    const existingDate = existing?.packedAt ?? '';
    if (!existing || date > existingDate || (date === existingDate && candidate.engineRef > existing.engineRef)) {
      latestByMinor.set(minorKey, candidate);
    }
  }

  for (const item of latestByMinor.values()) {
    keep.add(item.engineRef);
  }

  // Also keep any Kit packed within the retention window
  for (const candidate of Object.values(options.sidecars)) {
    if (candidate.packedAt) {
      const parsed = new Date(candidate.packedAt).getTime();
      if (!Number.isNaN(parsed) && now - parsed < retentionMs) {
        keep.add(candidate.engineRef);
      }
    }
  }

  const prune = Object.keys(options.sidecars)
    .filter((ref) => !keep.has(ref))
    .sort();

  return { keep, prune };
}
