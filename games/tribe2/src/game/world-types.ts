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
import { SoilDepletionState } from './entities/plants/soil-depletion-types';
import { TemperatureState } from './temperature/temperature-types';
import { Task } from './ai/task/task-types';

/**
 * Describes which edges of a planting zone are connected to adjacent zones of the same tribe.
 * Used to visually join adjacent planting zones by hiding stone borders between them.
 */
export interface PlantingZoneConnections {
  top: boolean;
  bottom: boolean;
  left: boolean;
  right: boolean;
}

export enum DiplomacyStatus {
  Friendly = 'Friendly',
  Hostile = 'Hostile',
}

export enum DebugPanelType {
  None,
  General,
  Performance,
  Ecosystem,
  Tribe,
  SupplyChain,
}

export type PerformanceMetricsBucket = {
  renderTime: number; // Time taken to render the frame
  worldUpdateTime: number; // Time taken to update the world state
  aiUpdateTime: number; // Time taken to update AI behaviors
};

interface PerformanceMetrics {
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
      action: PlayerActionType.AutopilotPlant;
      position: Vector2D;
    }
  | {
      action: PlayerActionType.AutopilotMove;
      position: Vector2D;
    }
  | {
      action: PlayerActionType.Removal;
      position: Vector2D;
    }
  | {
      action: PlayerActionType.AutopilotDeposit;
      targetEntityId: EntityId;
    }
  | {
      action: PlayerActionType.AutopilotRetrieve;
      targetEntityId: EntityId;
    }
  | {
      action: PlayerActionType.TakeOverBuilding;
      targetEntityId: EntityId;
    }
  | {
      action: PlayerActionType.RemoveEnemyBuilding;
      targetEntityId: EntityId;
    }
  | {
      action: PlayerActionType.AutopilotBuildingPlacement;
      position: Vector2D;
      buildingType: 'storageSpot' | 'plantingZone' | 'borderPost' | 'bonfire';
    }
  | {
      action: PlayerActionType.AutopilotChop;
      targetEntityId: EntityId;
    };

export type ScheduledEventType = 'ranged-impact';

export interface ScheduledEvent {
  id: number;
  type: ScheduledEventType;
  scheduledTime: number;
  data: {
    attackerId: EntityId;
    targetId: EntityId;
    damage: number;
    pushbackForce: number;
    attackerPosition: Vector2D;
  };
}

// Game State Interface
export interface GameWorldState {
  time: number; // Total game hours passed since the start of the game, float
  entities: Entities;
  visualEffects: VisualEffect[];
  nextVisualEffectId: VisualEffectId;
  scheduledEvents: ScheduledEvent[];
  nextScheduledEventId: number;
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
  buildMenuOpen: boolean;
  roleManagerOpen: boolean;
  armyControlOpen: boolean;
  selectedBuildingType: 'storageSpot' | 'plantingZone' | 'borderPost' | 'bonfire' | 'removal' | null;
  selectedBuildingForRemoval: EntityId | null;
  hasPlayerMovedEver: boolean;
  hasPlayerPlantedBush: boolean;
  hasPlayerEnabledAutopilot: number;
  masterVolume: number; // Global volume level (0.0 to 1.0)
  isMuted: boolean; // Global mute state
  uiButtons: ClickableUIButton[];
  tutorial: Tutorial;
  tutorialState: TutorialState;
  debugCharacterId?: EntityId;
  debugTribeId?: EntityId;
  hoveredButtonId?: string;
  mousePosition?: Vector2D;
  notifications: Notification[];
  // Holds the screen-space rectangles for notification buttons, updated each frame by the renderer.
  notificationButtonRects?: {
    dismiss: Record<string, Rect>;
    view: Record<string, Rect>;
  };
  ecosystem: EcosystemState;
  soilDepletion: SoilDepletionState; // Tracks soil health across the world grid
  temperature: TemperatureState; // Tracks regional temperature across the world grid
  debugPanel: DebugPanelType;
  debugPanelScroll: Vector2D;
  isDraggingDebugPanel: boolean;
  debugPanelRect?: Rect;
  debugPanelContentSize?: Pick<Rect, 'width' | 'height'>;
  performanceMetrics: PerformanceMetrics;
  autosaveIntervalSeconds?: number; // How often to autosave in real seconds
  lastAutosaveTime: number; // Timestamp of the last autosave (Date.now())
  // Map from planting zone entity ID to its connections to adjacent zones of the same tribe.
  // This is recalculated whenever planting zones change.
  plantingZoneConnections: Record<EntityId, PlantingZoneConnections>;
  terrainOwnership: Array<EntityId | null>; // 1D array representing ownership of each terrain tile
  tasks: Record<string, Task>;
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
    build: boolean;
    roleManagement: boolean;
    chopping: boolean;
  };
  hoveredAutopilotAction?: HoveredAutopilotAction;
  activeAutopilotAction?: HoveredAutopilotAction;
  isManuallyMoving: boolean;
  isManuallyPlanting?: boolean;
};
