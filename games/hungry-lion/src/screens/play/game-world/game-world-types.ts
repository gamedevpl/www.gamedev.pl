import { Entities } from './entities/entities-types';
import { Environment } from './environment/environment-types';

export type GameWorldState = {
  /**
   * The entities in the game.
   */
  entities: Entities;

  /**
   * Environment state.
   */
  environment: Environment;

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
};

export type UpdateContext = {
  /**
   * Game world state.
   */
  gameState: GameWorldState;

  /**
   * Time since the last update in milliseconds.
   */
  deltaTime: number;
};

export type GameOverStats = {
  timeSurvived: number;
};
