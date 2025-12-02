// Merged world types combining Tribe1 game mechanics with Tribe2 terrain system
import { BehaviorTreeComponent } from '../ai/behavior-tree-types';
import { StateData, StateType } from '../state-machine/state-machine-types';
import { Vector2D } from './math-types';
import { PerformanceMetrics } from './performance-types';

export type EntityId = number;

// Tribe2 terrain types - needed for resource management  
export enum BiomeType {
  TREE = 'tree',
  ROCK = 'rock',
  SNOW = 'snow',
  SAND = 'sand',
  GRASS = 'grass',
  GROUND = 'ground',
}

export enum BuildingType {
  HOUSE = 'house',
  BARN = 'barn',
  WORKSHOP = 'workshop',
}

export enum RoadDirection {
  N,
  NE,
  E,
  SE,
  S,
  SW,
  W,
  NW,
  NONE,
}

export interface RoadPiece {
  direction: RoadDirection;
  level: number; // normalized height 0-1
}

// Tribe2 EntityType enum (for new entities like buildings, trees)
export enum EntityType {
  PLAYER = 'player',
  BOID = 'boid',
  DEMO = 'demo',
  TREE = 'tree',
  RABBIT = 'rabbit',
  BUILDING = 'building',
}

// Re-export Tribe1 entity types as strings for compatibility
export type Tribe1EntityType = 'berryBush' | 'human' | 'corpse' | 'prey' | 'predator';

/**
 * Represents an active debuff effect on an entity
 */
export interface ActiveDebuff {
  type: 'slow';
  startTime: number;
  duration: number;
}

/**
 * Unified Entity interface merging Tribe1 and Tribe2 requirements
 */
export interface Entity {
  id: EntityId;
  isPlayer?: boolean;
  type: Tribe1EntityType | EntityType;
  position: Vector2D;
  radius: number;
  direction: Vector2D;
  acceleration: number;
  forces: Vector2D[];
  velocity: Vector2D;
  // State machine - using Tribe1's tuple format
  stateMachine?: [StateType, StateData];
  behaviorTree?: BehaviorTreeComponent;
  debuffs?: ActiveDebuff[];
  // Tribe1 specific fields
  gatheringCooldownTime?: number;
  eatingCooldownTime?: number;
  isHighlighted?: boolean;
  // Tribe2 building properties
  buildingType?: BuildingType;
  width?: number;
  height?: number;
  // Basic needs (could be used by both)
  needs?: {
    hunger: number;
    thirst: number;
    maxHunger: number;
    maxThirst: number;
  };
}

/**
 * Container for all entities in the game world
 */
export interface Entities {
  entities: Map<EntityId, Entity>;
  nextEntityId: EntityId;
}

/**
 * Merged GameWorldState with both Tribe1 mechanics and Tribe2 terrain
 */
export interface GameWorldState {
  time: number; // Elapsed time in seconds/hours
  entities: Entities;
  mapDimensions: {
    width: number;
    height: number;
  };
  // Tribe2 terrain system - essential for resource management
  heightMap: number[][];
  biomeMap: BiomeType[][];
  roadMap: (RoadPiece | null)[][];
  viewportCenter: Vector2D;
  viewportZoom: number;
  isPaused: boolean;
  gameOver: boolean;
  causeOfGameOver?: string;
  generationCount?: number;
  performanceMetrics: PerformanceMetrics;
  // Editor modes (to be removed in future - baseline only)
  terrainEditingMode?: boolean;
  biomeEditingMode?: boolean;
  selectedBiome?: BiomeType;
  editorBrush?: {
    position: Vector2D;
    radius: number;
  };
  wireframeMode?: boolean;
  roadEditingMode?: boolean;
  lastRoadPosition?: Vector2D | null;
  previewRoadPosition?: Vector2D | null;
  buildingPlacementMode?: boolean;
  selectedBuilding?: BuildingType;
  previewBuildingPosition?: Vector2D | null;
  isValidBuildingPlacement?: boolean;
  debugMode?: boolean;
}

/**
 * Context object passed to update functions
 */
export type UpdateContext = {
  gameState: GameWorldState;
  deltaTime: number; // Time in seconds
};

