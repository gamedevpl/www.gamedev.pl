import type { Scorecard } from '../platform/store.js';

// Filter readers grep on; see docs/agent-gcp-access.md.
export const SCORECARD_AGGREGATE_EVENT = 'scorecard_aggregate';

// Omits themes and untrusted strings; docs/agent-gcp-access.md says why.
export interface ScorecardAggregateLog {
  event: typeof SCORECARD_AGGREGATE_EVENT;
  slug: string;
  computedAt: string;
  windowDays: number;
  windowTruncated: boolean;
  sessions: number;
  bounces: number;
  closes: number;
  medianPlaySeconds: number;
  totalPlaySeconds: number;
  errors: number;
  stallRate: number;
  medianFps: number | null;
  finishRate: number | null;
  winRate: number | null;
  sessionsWithEnding: number;
  votesUp: number;
  votesDown: number;
  feedbackCount: number;
  feedbackThemeCount: number;
}

export function toAggregateLog(card: Scorecard): ScorecardAggregateLog {
  return {
    event: SCORECARD_AGGREGATE_EVENT,
    slug: card.slug,
    computedAt: card.computedAt,
    windowDays: card.window.days.length,
    windowTruncated: card.window.truncated,
    sessions: card.sessions.count,
    bounces: card.sessions.bounces,
    closes: card.sessions.closes,
    medianPlaySeconds: card.sessions.medianPlaySeconds,
    totalPlaySeconds: card.sessions.totalPlaySeconds,
    errors: card.health.errors,
    stallRate: card.health.stallRate,
    medianFps: card.health.medianFps,
    finishRate: card.depth.finishRate,
    winRate: card.depth.winRate,
    sessionsWithEnding: card.depth.sessionsWithEnding,
    votesUp: card.votes.up,
    votesDown: card.votes.down,
    feedbackCount: card.feedback.count,
    feedbackThemeCount: card.untrusted.feedbackThemes?.length ?? 0,
  };
}
