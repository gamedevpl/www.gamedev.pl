// Arg parsing and formatting for scripts/assessments.ts.
import type { GameAssessment } from './store.js';

// Flags whose next argv entry is their value, not the slug.
export const VALUE_FLAGS = new Set([
  '--slug',
  '--reviewer',
  '--verdict',
  '--limit',
  '--status',
  '--comment',
  '--link',
  '--id',
]);

export function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

export function flagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}

// The first bare word that is not some flag's value.
export function positional(args: string[]): string | undefined {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg.startsWith('--')) continue;
    const previous = index > 0 ? args[index - 1] : undefined;
    if (previous !== undefined && VALUE_FLAGS.has(previous)) continue;
    return arg;
  }
  return undefined;
}

// Splits `<slug>:<reviewerUid>`. Slugs forbid ':', so the first one always ends it.
export function splitAssessmentId(id: string): { slug: string; reviewerUid: string } | null {
  const at = id.indexOf(':');
  if (at <= 0 || at === id.length - 1) return null;
  return { slug: id.slice(0, at), reviewerUid: id.slice(at + 1) };
}

export interface Target {
  slug: string;
  // Present only when this target names one reviewer's row.
  reviewerUid?: string;
}

export interface TargetError {
  error: string;
}

// Target from --id, or the positional slug plus optional --reviewer. --id wins.
export function resolveTarget(args: string[]): Target | TargetError {
  const id = flagValue(args, '--id');
  const reviewerFlag = flagValue(args, '--reviewer');
  if (id !== undefined) {
    const parsed = splitAssessmentId(id);
    if (!parsed) return { error: `--id must look like <slug>:<reviewerUid>, got "${id}"` };
    if (reviewerFlag !== undefined && reviewerFlag !== parsed.reviewerUid) {
      return { error: `--reviewer ${reviewerFlag} conflicts with --id ${id}` };
    }
    return { slug: parsed.slug, reviewerUid: parsed.reviewerUid };
  }
  const slug = positional(args);
  if (!slug) return { error: 'missing slug (or --id)' };
  return { slug, reviewerUid: reviewerFlag };
}

export interface AssessmentFilters {
  reviewerUid?: string;
  verdict?: string;
  onlyOpen?: boolean;
  onlyResolved?: boolean;
}

export function filterAssessments(rows: GameAssessment[], filters: AssessmentFilters): GameAssessment[] {
  return rows.filter((row) => {
    if (filters.reviewerUid && row.reviewerUid !== filters.reviewerUid) return false;
    if (filters.verdict && row.verdict !== filters.verdict) return false;
    if (filters.onlyOpen && row.resolution !== null) return false;
    if (filters.onlyResolved && row.resolution === null) return false;
    return true;
  });
}

// One line per row, ending in the follow-up state.
export function formatAssessmentLine(row: GameAssessment): string {
  return (
    `${row.verdict.toUpperCase().padEnd(4)}  ${row.slug.padEnd(28)}  ${row.reviewerUid.padEnd(22)}  ` +
    `${row.updatedAt.slice(0, 10)}  ${row.resolution ? row.resolution.status : 'OPEN'}`
  );
}

export function formatResolutionLine(row: GameAssessment): string {
  if (!row.resolution) return 'open';
  const link = row.resolution.link ? ` (${row.resolution.link})` : '';
  return `${row.resolution.status} — ${row.resolution.comment}${link}`;
}

// cli: the operator authenticated to Google Cloud, not to the app.
export function cliActor(user: string | undefined): string {
  return `cli:${user ?? 'unknown'}`;
}
