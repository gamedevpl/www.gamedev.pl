import type { GameHealth } from './game-health.js';
import type { SubmissionState } from './submission-state.js';

// One row on the creator's Studio shelf.
export interface StudioGame {
  token: string;
  title: string;
  createdAt: string;
  // Last status derived server-side, refreshed by the sweep.
  lastKnownStatus: SubmissionState | null;
  slug?: string;
  publishedAt?: string;
  // Catalog publish time when this row is an improvement tip.
  livePublishedAt?: string;
  // The creator turned on the shared link for this draft.
  draftShared?: boolean;
  // The latest build ships an editor definition.
  editable?: boolean;
  // The Code surface kill switch is on for everyone.
  codeSurface?: boolean;
  // False only when the slug's publication is archived or disabled.
  live?: false;
}

// One page of the creator's Studio shelf.
export interface StudioGamesResponse {
  games: StudioGame[];
  truncated: boolean;
  totalGames: number;
}

// Play health for the creator's own games, over a chosen window.
export interface StudioHealthResponse {
  days: string[];
  // Telemetry scan hit the event budget.
  truncated: boolean;
  // Published-game list hit the shelf ceiling.
  gamesTruncated: boolean;
  totalGames: number;
  games: GameHealth[];
}

// The parts of a scorecard the health route cannot recompute.
export interface StudioScorecard {
  slug: string;
  computedAt: string;
  // Days the sweep actually read, so the window travels with it.
  windowDays: number;
  truncated: boolean;
  votes: { up: number; down: number };
  feedbackCount: number;
  // Player-written text: safe to render, never to hand an agent.
  untrustedThemes: Array<{ theme: string; count: number }>;
}

// Scorecards for the creator's games, with what the listing dropped.
export interface StudioScorecardsResponse {
  scorecards: StudioScorecard[];
  truncated: boolean;
  totalGames: number;
}

// Build versions for a creator's game.
export interface StudioBuildsResponse {
  builds: import('./submission-status.js').RecentBuild[];
  totalCount: number;
}
