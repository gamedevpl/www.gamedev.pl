import { BuildingType } from '../world-types';

// Core Game Constants

// World and Movement Constants
/** The width of the game world in pixels. */
export const MAP_WIDTH = 3000;

/** The height of the game world in pixels. */
export const MAP_HEIGHT = 3000;

/** The size of each cell in the heightmap grid, in world pixels. */
export const HEIGHT_MAP_RESOLUTION = 50;

/** The normalized height value (0-1) that represents the water level. */
export const WATER_LEVEL = 0.45;

// Biome Constants
/** The normalized height value (0-1) above which snow appears. */
export const SNOW_LEVEL = 0.8;

/** The normalized height value (0-1) above which rock appears. */
export const ROCK_LEVEL = 0.65;

/** The normalized height value (0-1) above which grass appears. */
export const GRASS_LEVEL = 0.5;

/** The normalized height value (0-1) above which sand appears. */
export const SAND_LEVEL = 0.46;

/** The radius of tree entities in pixels. */
export const TREE_RADIUS = 8;

/** The minimum heightmap value (0-1) required for trees to spawn. */
export const TREE_SPAWN_THRESHOLD = 0.48;

/** The probability (0-1) of a tree spawning in a valid location. */
export const TREE_SPAWN_DENSITY = 0.15;

// Rabbit Constants
/** The radius of rabbit entities in pixels. */
export const RABBIT_RADIUS = 6;

/** The movement speed of rabbits in pixels per second. */
export const RABBIT_SPEED = 40;

/** The vision range of rabbits in pixels. */
export const RABBIT_VISION_RANGE = 300;

/** The probability (0-1) of a rabbit spawning in a valid location. */
export const RABBIT_SPAWN_DENSITY = 0.02;

// Simulation Constants
/** The maximum delta time in seconds to process in a single frame, to prevent large simulation jumps. */
export const MAX_REAL_TIME_DELTA = 1 / 60;

// Terrain Editor Constants
/** The radius of the terrain editing brush in world units. */
export const TERRAIN_EDIT_BRUSH_RADIUS = 150;
/** The intensity of the terrain editing effect (how much height is added/removed per frame). */
export const TERRAIN_EDIT_INTENSITY = 0.01;

// Road Constants
/** The width of roads in world units. */
export const ROAD_WIDTH = 100;
/** The intensity of the terrain leveling effect when placing roads. */
export const ROAD_LEVEL_INTENSITY = 0.3;

// Building Constants
/** Specifications for each building type. */
export const BUILDING_SPECS: Record<BuildingType, { width: number; height: number; color: string }> = {
  [BuildingType.HOUSE]: { width: 60, height: 60, color: '#8B4513' },
  [BuildingType.BARN]: { width: 80, height: 100, color: '#A52A2A' },
  [BuildingType.WORKSHOP]: { width: 70, height: 70, color: '#556B2F' },
};

/** The minimum distance required between buildings. */
export const BUILDING_MIN_SPACING = 20;
