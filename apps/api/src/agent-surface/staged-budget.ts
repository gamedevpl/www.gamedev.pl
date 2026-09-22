// The staging cap is only reported as two numbers, so an agent learns it is out of
// room by being refused. At a tight budget every edit is reclaim, not feature work,
// and knowing one call earlier is the difference between planning and discovering.
export const STAGED_BUDGET_WARN_FRACTION = 0.95;

export interface StagedTotals {
  totalBytes?: number;
  maxBytes?: number;
}

export function stagedBudgetWarning(staged: StagedTotals | undefined): string | null {
  const total = staged?.totalBytes;
  const max = staged?.maxBytes;
  if (typeof total !== 'number' || typeof max !== 'number' || max <= 0) return null;
  if (total < max * STAGED_BUDGET_WARN_FRACTION) return null;
  const remaining = Math.max(0, max - total);
  const percent = Math.round((total / max) * 100);
  return (
    `staged sources are at ${percent}% of the ${max} byte budget (${remaining} left) — ` +
    'reclaim space before staging more, or the next submit is refused'
  );
}
