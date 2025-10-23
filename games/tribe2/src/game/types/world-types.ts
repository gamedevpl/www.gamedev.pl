import { BehaviorTreeComponent } from '../ai/behavior-tree-types';
import { StateMachineComponent } from '../state-machine/state-machine-types';
import { Vector2D } from './math-types';
import { PerformanceMetrics } from './performance-types';

export type EntityId = number;

export enum EntityType {
  PLAYER = 'player',
  BOID = 'boid',
  DEMO = 'demo',
  TREE = 'tree',
}

export enum BiomeType {
  TREE = 'tree',
  ROCK = 'rock',
  SNOW = 'snow',
  SAND = 'sand',
  GRASS = 'grass',
  GROUND = 'ground',
}

/**
 * A generic base entity for any object in the game world.
 * This can be extended with components for specific game objects.
 */
export interface Entity {
  id: EntityId;
  type: EntityType;
  position: Vector2D;
  radius: number;
  velocity: Vector2D;
  direction: Vector2D;
  acceleration: number;
  forces: Vector2D[];
  // AI and State Machine components
  stateMachine?: StateMachineComponent;
  behaviorTree?: BehaviorTreeComponent;
}

/**
 * Container for all entities in the game world.
 */
export interface Entities {
  entities: Map<EntityId, Entity>;
  nextEntityId: EntityId;
}

/**
 * The main state object for the entire game world.
 * This will be extended by the specific game with its own state.
 */
export interface GameWorldState {
  time: number; // Elapsed time in seconds (real-world time)
  entities: Entities;
  mapDimensions: {
    width: number;
    height: number;
  };
  heightMap: number[][];
  biomeMap: BiomeType[][];
  viewportCenter: Vector2D;
  viewportZoom: number; // Zoom level (1.0 = normal, 2.0 = 2x zoom in, 0.5 = 2x zoom out)
  isPaused: boolean;
  gameOver: boolean;
  performanceMetrics: PerformanceMetrics;
  // Editor modes
  terrainEditingMode: boolean;
  biomeEditingMode: boolean;
  selectedBiome: BiomeType;
  editorBrush: {
    position: Vector2D;
    radius: number;
  };
}

/**
 * Context object passed to various update functions.
 */
export type UpdateContext = {
  gameState: GameWorldState;
  deltaTime: number; // Real time in seconds
};