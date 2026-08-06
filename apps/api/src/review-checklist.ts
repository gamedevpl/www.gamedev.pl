// Fixed axes; see game-assessment-plan.md.
export const ASSESSMENT_CHECKLIST_KEYS = ['graphics', 'gameplay', 'fun', 'sound', 'controls'] as const;

export type AssessmentChecklistKey = (typeof ASSESSMENT_CHECKLIST_KEYS)[number];
export type AssessmentChecklistMark = 'ok' | 'weak' | 'bad';
export type AssessmentChecklist = Record<AssessmentChecklistKey, AssessmentChecklistMark>;

const MARKS = new Set<AssessmentChecklistMark>(['ok', 'weak', 'bad']);

export function isAssessmentChecklist(value: unknown): value is AssessmentChecklist {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  for (const key of ASSESSMENT_CHECKLIST_KEYS) {
    if (!MARKS.has(row[key] as AssessmentChecklistMark)) return false;
  }
  return true;
}

// Compact operator line: graphics ok · gameplay weak.
export function formatAssessmentChecklist(checklist: AssessmentChecklist | null | undefined): string {
  if (!checklist) return '';
  return ASSESSMENT_CHECKLIST_KEYS.map((key) => `${key} ${checklist[key]}`).join(' · ');
}
