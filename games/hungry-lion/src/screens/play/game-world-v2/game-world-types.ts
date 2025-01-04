import { Entities } from './entities-types';

export type GameState = {
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
};

export type UpdateContext = {
  /**
   * Time since the last update in milliseconds.
   */
  deltaTime: number;
};
