// Who and what the read-cost fixture measures.

export const SESSION_SECRET = 'dev-session-secret-change-me';
export const SUBMISSION_SECRET = 'read-cost-token-secret';
export const AT = '2026-01-15T12:00:00.000Z';

export const CREATOR_UID = 'g:creator';
export const DERIVED_OWNER_UID = 'g:derived-owner';
export const REVIEWER_UID = 'g:reviewer';
export const DECOY_UID = 'g:decoy';
export const DECOY_REVIEWER_UID = 'g:decoy-reviewer';
export const ADMIN_UID = 'g:operator';
export const POLLED_JOB_ID = 1001;

// A second round on the same slug: its poll pays for history.
export const PRIOR_ROUNDS_JOB_ID = 1002;

// Stuck in dispatched long after boot, like prod job 1000167.
export const STALE_DISPATCH_JOB_ID = 1009;

export const POLLED_ROUTES = [
  'GET /api/submissions/:token',
  'GET /api/submissions/:token (steady state)',
  'GET /api/submissions/:token (share link, steady state)',
  'GET /api/submissions/:token (prior rounds)',
  'GET /api/submissions/:token (prior rounds, steady state)',
  'GET /api/submissions/:token (stale dispatch, steady state)',
  'GET /api/submissions/mine',
  'GET /api/submissions/mine (derived-only owner)',
  'GET /api/submissions/mine (document, steady state)',
  'GET /api/review/status',
  'GET /api/notifications',
  'GET /api/admin/summary (steady state)',
  'POST /api/internal/notify-sweep (steady state)',
] as const;

export type PolledRoute = (typeof POLLED_ROUTES)[number];
