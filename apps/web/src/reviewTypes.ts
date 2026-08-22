import type {
  AssessmentChecklistKey,
  AssessmentChecklistMark,
  AssessmentInputMethod,
  AssessmentNoteOrigin,
  AssessmentPlatform,
  AssessmentSource,
  AssessmentVerdict,
} from '@gamedevpl/contract';

export type {
  AssessmentChecklistKey,
  AssessmentChecklistMark,
  AssessmentInputMethod,
  AssessmentNoteOrigin,
  AssessmentPlatform,
  AssessmentSource,
  AssessmentVerdict,
};
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
