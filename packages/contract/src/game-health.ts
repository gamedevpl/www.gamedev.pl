// One game's play health over a telemetry window, aggregates only.
export interface GameHealth {
  slug: string;
  // Distinct opens of the game.
  sessions: number;
  // Sessions that opened but never recorded play time.
  bounces: number;
  // Sessions that reported a clean exit.
  closes: number;
  // Median of each session's total focused play time.
  medianPlaySeconds: number;
  totalPlaySeconds: number;
  // Uncaught errors and rejections reported by the bridge.
  errors: number;
  errorSamples: Array<{ message: string; count: number }>;
  aliveTicks: number;
  stalledTicks: number;
  stallRate: number;
  medianFps: number | null;
  resumeTicksIgnored: number;
  // Rounds that reached a conclusion, counted per round.
  outcomes: { won: number; lost: number; quit: number };
  sessionsWithEnding: number;
  // Sessions that finished a round, over all sessions.
  finishRate: number;
  // Sessions issued a seat in a shared world.
  zoneAdmitted: number;
  // Of those, how many had a world actually arrive.
  zoneJoined: number;
  // Null when this game never asked for a zone.
  zoneJoinRate: number | null;
  // Won over decided rounds; quits decide nothing.
  winRate: number | null;
  // Median across sessions of each session's best score.
  medianBestScore: number | null;
  // Game-authored text — render, never interpolate.
  progressLabels: Array<{ label: string; sessions: number }>;
  // Sessions that reported a render backend on progress or end.
  gfxBackends: { canvas2d: number; webgl: number; webgl3d: number };
}
