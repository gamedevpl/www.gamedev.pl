import { BehaviorTreeComponent } from '../ai/behavior-tree-types';
import { StateMachineComponent } from '../state-machine/state-machine-types';
import { Vector2D } from './math-types';

export type EntityId = number;

/**
 * A generic base entity for any object in the game world.
 * This can be extended with components for specific game objects.
 */
export interface Entity {
  id: EntityId;
  type: string;
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
 * Performance tracking structures.
 */
export type PerformanceMetricsBucket = {
  renderTime: number;
  worldUpdateTime: number;
  aiUpdateTime: number;
};

export interface PerformanceMetrics {
  currentBucket: PerformanceMetricsBucket;
  history: (PerformanceMetricsBucket & { bucketTime: number })[];
}

/**
 * 3D vector type for light direction and other 3D calculations.
 */
export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

/**
 * WebGPU renderer state for terrain rendering.
 */
export interface WebGPUTerrainState {
  canvas: HTMLCanvasElement;
  device: GPUDevice;
  context: GPUCanvasContext;
  format: GPUTextureFormat;
  pipeline: GPURenderPipeline;
  uniformBuffer: GPUBuffer;
  bindGroup: GPUBindGroup;
  sampler: GPUSampler;
  heightTexture: GPUTexture;
  heightTextureView: GPUTextureView;
  gridSize: { width: number; height: number };
  mapDimensions: { width: number; height: number };
  cellSize: number; // world units per height texel (HEIGHT_MAP_RESOLUTION)
  // Lighting parameters
  lightDir: Vector3D;
  heightScale: number;
  ambient: number;
  // Water parameters
  waterLevel: number;
  time: number; // For water animation
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
  viewportCenter: Vector2D;
  viewportZoom: number; // Zoom level (1.0 = normal, 2.0 = 2x zoom in, 0.5 = 2x zoom out)
  isPaused: boolean;
  gameOver: boolean;
  performanceMetrics: PerformanceMetrics;
  // Optional GPU terrain renderer state (present when WebGPU is initialized)
  webgpu?: WebGPUTerrainState;
}

/**
 * Context object passed to various update functions.
 */
export type UpdateContext = {
  gameState: GameWorldState;
  deltaTime: number; // Real time in seconds
};
