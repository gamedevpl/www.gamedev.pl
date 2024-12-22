export type GameWorldState = {
  time: number;
  gameOver: boolean;
  gameOverStats?: GameOverStats;

  player: PlayerState;
};

export type PlayerState = {
  x: number;
  y: number;
};

export type GameOverStats = {
  timeSurvived: number;
};
