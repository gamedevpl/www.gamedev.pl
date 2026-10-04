import type { FramePerformanceGroup } from './frame-telemetry.js';
import type { ReviewerCohort } from './telemetry-cohort.js';

export interface GamePerformanceQuery {
  slug: string;
  days: number;
  performanceReviewers: ReviewerCohort;
  artifactVersion?: string;
}

export interface GamePerformanceResponse {
  slug: string;
  requestedDays: number;
  days: string[];
  performanceReviewers: ReviewerCohort;
  artifactVersion: string | null;
  availableVersions: string[];
  versionsTruncated: boolean;
  measuredAt: string;
  freshUntil: string;
  status: 'no_traffic' | 'no_valid_windows' | 'measured';
  scanTruncated: boolean;
  groupsTruncated: boolean;
  totalGroups: number;
  measuredSessions: number;
  unmeasuredSessions: number;
  invalidWindows: number;
  agentEventsExcluded: number;
  aliveWithoutPerformance: number;
  groups: FramePerformanceGroup[];
}

export type GamePerformanceResult =
  | { ok: true; report: GamePerformanceResponse }
  | { ok: false; code: 'not_owner' | 'not_published' | 'rate_limited'; retryAfterSeconds?: number };

export type ReadGamePerformance = (uid: string, query: GamePerformanceQuery) => Promise<GamePerformanceResult>;
