/**
 * Defines the core data structures and type definitions for the Tribe game world state,
 * characters, and interactive elements like berry bushes.
 */

import { EntityId, Entities } from './entities/entities-types';
import { ClickableUIButton } from './ui/ui-types';
import { Tutorial, TutorialState } from './tutorial';
import { Vector2D } from './utils/math-types';
import { VisualEffect, VisualEffectId } from './visual-effects/visual-effect-types';

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
  hasPlayerMovedEver: boolean;
  hasPlayerPlantedBush?: boolean;
  llmAutopilot?: Promise<void>;
  masterVolume: number; // Global volume level (0.0 to 1.0)
  isMuted: boolean; // Global mute state
  uiButtons: ClickableUIButton[];
  tutorial: Tutorial;
  tutorialState: TutorialState;
  debugCharacterId?: EntityId;
}

export type UpdateContext = {
  /**
   * Game world state.
   */
  gameState: GameWorldState;

  /**
   * Time since the last update in milliseconds.\\n   */
  deltaTime: number;
};
