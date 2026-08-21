import { ASSESSMENT_CHECKLIST_KEYS } from '@gamedevpl/contract';
import type { AssessmentChecklist, AssessmentChecklistMark } from './reviewTypes.js';

export { ASSESSMENT_CHECKLIST_KEYS };

export const ASSESSMENT_CHECKLIST_MARKS = ['ok', 'weak', 'bad'] as const satisfies readonly AssessmentChecklistMark[];

export function emptyAssessmentChecklist(): Partial<AssessmentChecklist> {
  return {};
}

export function isChecklistComplete(checklist: Partial<AssessmentChecklist>): checklist is AssessmentChecklist {
  return ASSESSMENT_CHECKLIST_KEYS.every((key) => {
    const mark = checklist[key];
    return mark === 'ok' || mark === 'weak' || mark === 'bad';
  });
}

export function formatAssessmentChecklist(checklist: AssessmentChecklist | null | undefined): string {
  if (!checklist) return '';
  return ASSESSMENT_CHECKLIST_KEYS.map((key) => `${key} ${checklist[key]}`).join(' · ');
}
