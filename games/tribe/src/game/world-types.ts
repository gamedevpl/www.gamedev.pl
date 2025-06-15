/**
 * Defines the core data structures and type definitions for the Tribe game world state,
 * characters, and interactive elements like berry bushes.
 */

import { Entities } from './entities/entities-types';
import { ClickableUIButton } from './ui/ui-types';
import { Vector2D } from './utils/math-types';
import { VisualEffect, VisualEffectId } from './visual-effects/visual-effect-types';

// Basic Types
export type Position = {
  x: number;
  y: number;
};

// Game State Interface
export interface GameWorldState {
  time: number; // Total game hours passed since the start of the game, float
  entities: Entities;
  visualEffects: VisualEffect[];
  nextVisualEffectId: VisualEffectId;
  mapDimensions: {
    width: number;
    height: number;
  };
  generationCount: number; // Number of generations that have passed
  gameOver: boolean; // Flag to indicate if the game is over
  causeOfGameOver?: string; // Optional cause of game over
  viewportCenter: Vector2D;
  isPaused: boolean;
  isPlayerOnAutopilot: boolean;
  masterVolume: number; // Global volume level (0.0 to 1.0)
  isMuted: boolean; // Global mute state
  uiButtons: ClickableUIButton[];
}

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
