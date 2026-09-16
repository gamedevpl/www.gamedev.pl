export const EFFORT_WEIGHT_LOC = 0.5;
export const EFFORT_WEIGHT_ARTIFACTS = 0.3;
export const EFFORT_WEIGHT_COMMITS = 0.2;

export interface EffortInputs {
  loc: number;
  artifacts: number;
  commits: number;
}

export function countCodeLines(sources: readonly string[]): number {
  const combined = sources.join('\n');
  if (!combined) return 0;
  return combined.split(/\r?\n/).filter((line) => {
    const trimmed = line.trim();
    return trimmed !== '' && !trimmed.startsWith('//') && !trimmed.startsWith('*') && !trimmed.startsWith('/*');
  }).length;
}

export function isGameLocPath(relative: string): boolean {
  return relative === 'game.ts' || (relative.startsWith('game/') && relative.endsWith('.ts'));
}

export function countTraceFrames(raw: string | null | undefined): number {
  if (!raw) return 0;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return 0;
    const frames = (parsed as { frames?: unknown }).frames;
    if (typeof frames === 'number' && Number.isFinite(frames) && frames >= 0) {
      return Math.floor(frames);
    }
    if (Array.isArray((parsed as { samples?: unknown }).samples)) {
      return (parsed as { samples: unknown[] }).samples.length;
    }
  } catch {
    return 0;
  }
  return 0;
}

function jsonArrayLength(raw: string | null | undefined, key: string): number {
  if (!raw) return 0;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return 0;
    const value = (parsed as Record<string, unknown>)[key];
    return Array.isArray(value) ? value.length : 0;
  } catch {
    return 0;
  }
}

export function countArtifactRichness(args: {
  trace?: string | null;
  acceptance?: string | null;
  playtest?: string | null;
  mediaPngCount: number;
}): number {
  return (
    countTraceFrames(args.trace) +
    jsonArrayLength(args.acceptance, 'achieved') +
    jsonArrayLength(args.playtest, 'expectProgress') +
    Math.max(0, args.mediaPngCount)
  );
}

function logNorm(value: number, max: number): number {
  if (max <= 0) return 0;
  return Math.log1p(Math.max(0, value)) / Math.log1p(max);
}

export function clampEffort(value: number): number {
  return Math.round(Math.min(1, Math.max(0, value)) * 1000) / 1000;
}

export function parseOptionalEffort(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) return undefined;
  return clampEffort(value);
}

export function normalizeEffort(inputs: ReadonlyMap<string, EffortInputs>): Map<string, number> {
  let maxLoc = 0;
  let maxArtifacts = 0;
  let maxCommits = 0;
  for (const row of inputs.values()) {
    maxLoc = Math.max(maxLoc, row.loc);
    maxArtifacts = Math.max(maxArtifacts, row.artifacts);
    maxCommits = Math.max(maxCommits, row.commits);
  }

  const out = new Map<string, number>();
  for (const [slug, row] of inputs) {
    out.set(
      slug,
      clampEffort(
        EFFORT_WEIGHT_LOC * logNorm(row.loc, maxLoc) +
          EFFORT_WEIGHT_ARTIFACTS * logNorm(row.artifacts, maxArtifacts) +
          EFFORT_WEIGHT_COMMITS * logNorm(row.commits, maxCommits),
      ),
    );
  }
  return out;
}
