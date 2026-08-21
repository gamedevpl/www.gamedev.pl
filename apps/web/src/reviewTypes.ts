import type { AssessmentChecklistKey } from '@gamedevpl/contract';

export type { AssessmentChecklistKey };
export type AssessmentVerdict = 'keep' | 'cut' | 'skip';
export type AssessmentSource = 'catalog' | 'creator';
export type AssessmentNoteOrigin = 'text' | 'speech' | 'none';
export type AssessmentInputMethod = 'touch' | 'mouse' | 'mixed';
export type AssessmentPlatform = 'ios' | 'android' | 'mac' | 'windows' | 'linux' | 'other';
export type AssessmentChecklistMark = 'ok' | 'weak' | 'bad';
export type AssessmentChecklist = Record<AssessmentChecklistKey, AssessmentChecklistMark>;

export interface AssessmentClientContext {
  viewportW: number;
  viewportH: number;
  screenW: number;
  screenH: number;
  dpr: number;
  input: AssessmentInputMethod;
  platform: AssessmentPlatform;
  lang: string | null;
  ua: string | null;
}
