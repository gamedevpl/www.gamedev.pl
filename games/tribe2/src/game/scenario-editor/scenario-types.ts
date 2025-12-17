/**
 * Types for the Scenario Editor.
 * Defines the scenario configuration that can be used to initialize a custom game world.
 */

import { Vector2D } from '../utils/math-types';
import { EcosystemState } from '../ecosystem';
import { BuildingType } from '../entities/buildings/building-types';

/**
 * Configuration for a single tribe in the scenario.
 */
export interface ScenarioTribe {
  id: string;
  badge: string;
  position: Vector2D;
  humans: ScenarioHuman[];
}

/**
 * Configuration for a human in the scenario.
 */
export interface ScenarioHuman {
  id: string;
  gender: 'male' | 'female';
  age: number;
  isPlayer?: boolean;
  isLeader?: boolean;
  position: Vector2D;
  tribeId: string;
}

/**
 * Configuration for a berry bush in the scenario.
 */
export interface ScenarioBerryBush {
  id: string;
  position: Vector2D;
}

/**
 * Configuration for a prey animal in the scenario.
 */
export interface ScenarioPrey {
  id: string;
  gender: 'male' | 'female';
  position: Vector2D;
}

/**
 * Configuration for a predator in the scenario.
 */
export interface ScenarioPredator {
  id: string;
  gender: 'male' | 'female';
  position: Vector2D;
}

/**
 * Configuration for a building in the scenario.
 */
export interface ScenarioBuilding {
  id: string;
  type: BuildingType;
  position: Vector2D;
  tribeId: string;
  isConstructed: boolean;
}

/**
 * The main scenario configuration.
 */
export interface ScenarioConfig {
  name: string;
  description: string;
  mapWidth: number;
  mapHeight: number;
  tribes: ScenarioTribe[];
  berryBushes: ScenarioBerryBush[];
  prey: ScenarioPrey[];
  predators: ScenarioPredator[];
  buildings: ScenarioBuilding[];
  ecosystemSettings: Partial<EcosystemState>;
  playerStartPosition?: Vector2D;
  playerTribeId?: string;
}

/**
 * The current state of the scenario editor.
 */
export interface ScenarioEditorState {
  config: ScenarioConfig;
  selectedTool: EditorTool;
  selectedTribeId: string | null;
  selectedEntityId: string | null;
  isPanning: boolean;
  viewportCenter: Vector2D;
  zoom: number;
}

/**
 * Tools available in the scenario editor.
 */
export type EditorTool =
  | 'select'
  | 'pan'
  | 'addTribe'
  | 'addHuman'
  | 'addBerryBush'
  | 'addPrey'
  | 'addPredator'
  | 'addBuilding'
  | 'setPlayerStart'
  | 'delete';

/**
 * Creates a default scenario configuration.
 */
export function createDefaultScenarioConfig(): ScenarioConfig {
  return {
    name: 'New Scenario',
    description: '',
    mapWidth: 4000,
    mapHeight: 4000,
    tribes: [],
    berryBushes: [],
    prey: [],
    predators: [],
    buildings: [],
    ecosystemSettings: {},
    playerStartPosition: undefined,
    playerTribeId: undefined,
  };
}

/**
 * Creates the initial editor state.
 */
export function createInitialEditorState(): ScenarioEditorState {
  return {
    config: createDefaultScenarioConfig(),
    selectedTool: 'select',
    selectedTribeId: null,
    selectedEntityId: null,
    isPanning: false,
    viewportCenter: { x: 2000, y: 2000 },
    zoom: 1,
  };
}

/**
 * List of available tribe badges.
 */
export const AVAILABLE_BADGES = ['👑', '🔥', '⭐', '🌙', '☀️', '🌿', '⚡', '🌊', '🏔️', '🦁', '🐺', '🦅'];

/**
 * Generates a unique ID for scenario entities.
 */
export function generateScenarioId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}
