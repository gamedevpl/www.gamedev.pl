import { Entities } from './entities/entities-types';
import { Environment } from './environment/environment-types';
import { NotificationsState } from './notifications/notifications-types';

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
   * Notifications state.
   */
  notifications: NotificationsState;

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
  deathCause: 'starvation';
};
