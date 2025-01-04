import { Entities } from './entities-types';
import { PreySpawnConfig } from './prey-spawner';

export type GameWorldState = {
  /**
   * The entities in the game.
   */
  entities: Entities;

  /**
   * Time since the game started in milliseconds.
   */
  time: number;

  /**
   * Whether the game is over.
   */
  gameOver: boolean;

  /**
   * Stats for the game over screen.
   */
  gameOverStats?: GameOverStats;

  /**
   * Configuration for prey spawning mechanics
   */
  spawnConfig: PreySpawnConfig;
};

export type UpdateContext = {
  /**
   * Time since the last update in milliseconds.
   */
  deltaTime: number;
};

export type GameOverStats = {
  timeSurvived: number;
};