// The five facets a game assessment rates, shared by API and web.
export const ASSESSMENT_CHECKLIST_KEYS = ['graphics', 'gameplay', 'fun', 'sound', 'controls'] as const;

export type AssessmentChecklistKey = (typeof ASSESSMENT_CHECKLIST_KEYS)[number];
