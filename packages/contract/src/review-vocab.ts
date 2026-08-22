// Reviewer verdict on one game; see game-assessment-plan.md.
export const ASSESSMENT_VERDICTS = ['keep', 'cut', 'skip'] as const;
export type AssessmentVerdict = (typeof ASSESSMENT_VERDICTS)[number];

export const ASSESSMENT_SOURCES = ['catalog', 'creator'] as const;
export type AssessmentSource = (typeof ASSESSMENT_SOURCES)[number];

export const ASSESSMENT_NOTE_ORIGINS = ['text', 'speech', 'none'] as const;
export type AssessmentNoteOrigin = (typeof ASSESSMENT_NOTE_ORIGINS)[number];

export const ASSESSMENT_INPUT_METHODS = ['touch', 'mouse', 'mixed'] as const;
export type AssessmentInputMethod = (typeof ASSESSMENT_INPUT_METHODS)[number];

export const ASSESSMENT_PLATFORMS = ['ios', 'android', 'mac', 'windows', 'linux', 'other'] as const;
export type AssessmentPlatform = (typeof ASSESSMENT_PLATFORMS)[number];

export const ASSESSMENT_CHECKLIST_MARKS = ['ok', 'weak', 'bad'] as const;
export type AssessmentChecklistMark = (typeof ASSESSMENT_CHECKLIST_MARKS)[number];

export const REVIEW_SWEEP_STATUSES = ['active', 'paused', 'completed', 'cancelled'] as const;
export type ReviewSweepStatus = (typeof REVIEW_SWEEP_STATUSES)[number];

export const REVIEW_SWEEP_SOURCES = ['catalog', 'creator', 'all'] as const;
export type ReviewSweepSource = (typeof REVIEW_SWEEP_SOURCES)[number];

export const RE_REVIEW_REQUEST_STATUSES = ['open', 'resolved', 'cancelled'] as const;
export type ReReviewRequestStatus = (typeof RE_REVIEW_REQUEST_STATUSES)[number];

// What an operator did about one assessment; see game-assessment-plan.md.
export const ASSESSMENT_RESOLUTION_STATUSES = ['addressed', 'wont_fix', 'deferred'] as const;
export type AssessmentResolutionStatus = (typeof ASSESSMENT_RESOLUTION_STATUSES)[number];
