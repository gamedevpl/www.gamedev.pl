import {
  ASSESSMENT_CHECKLIST_KEYS,
  ASSESSMENT_CHECKLIST_MARKS,
  type AssessmentChecklistKey,
  type AssessmentChecklistMark,
} from '@gamedevpl/contract';

export { ASSESSMENT_CHECKLIST_KEYS, type AssessmentChecklistKey, type AssessmentChecklistMark };
export type AssessmentChecklist = Record<AssessmentChecklistKey, AssessmentChecklistMark>;

export function isAssessmentChecklist(value: unknown): value is AssessmentChecklist {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  for (const key of ASSESSMENT_CHECKLIST_KEYS) {
    if (!(ASSESSMENT_CHECKLIST_MARKS as readonly string[]).includes(row[key] as string)) return false;
  }
  return true;
}

// Compact operator line: graphics ok · gameplay weak.
export function formatAssessmentChecklist(checklist: AssessmentChecklist | null | undefined): string {
  if (!checklist) return '';
  return ASSESSMENT_CHECKLIST_KEYS.map((key) => `${key} ${checklist[key]}`).join(' · ');
}
