/**
 * Defines the core data structures and type definitions for the Tribe game world state,
 * characters, and interactive elements like berry bushes.
 */

import { EntityId, Entities } from './entities/entities-types';
import { ClickableUIButton, PlayerActionType } from './ui/ui-types';
import { Tutorial, TutorialState } from './tutorial';
import { Vector2D } from './utils/math-types';
import { VisualEffect, VisualEffectId } from './visual-effects/visual-effect-types';
import { Notification, Rect } from './notifications/notification-types';
import { EcosystemState } from './ecosystem';

export enum DiplomacyStatus {
  Friendly = 'Friendly',
  Hostile = 'Hostile',
}

export enum DebugPanelType {
  None,
  General,
  Performance,
  Ecosystem,
}

export const PERFORMANCE_METRICS_HISTORY_LENGTH = 100;

export type PerformanceMetricsBucket = {
  renderTime: number; // Time taken to render the frame
  worldUpdateTime: number; // Time taken to update the world state
  aiUpdateTime: number; // Time taken to update AI behaviors
};

export interface PerformanceMetrics {
  currentBucket: PerformanceMetricsBucket;
  history: (PerformanceMetricsBucket & { bucketTime: number })[];
}

export type HoveredAutopilotAction =
  | {
      action: PlayerActionType.AutopilotGather;
      targetEntityId: EntityId;
    }
  | {
      action: PlayerActionType.AutopilotProcreate;
      targetEntityId: EntityId;
    }
  | {
      action: PlayerActionType.AutopilotAttack;
      targetEntityId: EntityId;
    }
  | {
      action: PlayerActionType.AutopilotFeedChild;
      targetEntityId: EntityId;
    }
  | {
      action: PlayerActionType.AutopilotFollowMe;
      targetEntityId: EntityId;
    }
  | {
      action: PlayerActionType.AutopilotPlant;
      position: Vector2D;
    }
  | {
      action: PlayerActionType.AutopilotMove;
      position: Vector2D;
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
  exitConfirmation: 'inactive' | 'pending';
  autopilotControls: AutopilotControls;
  hasPlayerMovedEver: boolean;
  hasPlayerPlantedBush: boolean;
  hasPlayerEnabledAutopilot: number;
  masterVolume: number; // Global volume level (0.0 to 1.0)
  isMuted: boolean; // Global mute state
  uiButtons: ClickableUIButton[];
  tutorial: Tutorial;
  tutorialState: TutorialState;
  debugCharacterId?: EntityId;
  hoveredButtonId?: string;
  mousePosition?: Vector2D;
  notifications: Notification[];
  // Holds the screen-space rectangles for notification buttons, updated each frame by the renderer.
  notificationButtonRects?: {
    dismiss: Map<string, Rect>;
    view: Map<string, Rect>;
  };
  ecosystem: EcosystemState;
  debugPanel: DebugPanelType;
  performanceMetrics: PerformanceMetrics;
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

export type AutopilotControls = {
  behaviors: {
    procreation: boolean;
    planting: boolean;
    gathering: boolean;
    attack: boolean;
    feedChildren: boolean;
    followLeader: boolean;
  };
  hoveredAutopilotAction?: HoveredAutopilotAction;
  activeAutopilotAction?: HoveredAutopilotAction;
  isManuallyMoving: boolean;
  isManuallyPlanting?: boolean;
};
