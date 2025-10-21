import { createEntities, createEntity } from './ecs/entity-manager';
import {
  HEIGHT_MAP_RESOLUTION,
  MAP_HEIGHT,
  MAP_WIDTH,
  TREE_RADIUS,
  TREE_SPAWN_DENSITY,
  WATER_LEVEL,
  SNOW_LEVEL,
  ROCK_LEVEL,
  GRASS_LEVEL,
  SAND_LEVEL,
} from './constants/world-constants';
import { Entities, EntityType, BiomeType, GameWorldState } from './types/world-types';
import { createNoise2D } from './utils/noise-utils';

/**
 * Generates a height map using Perlin noise.
 * @param width The width of the world in pixels.
 * @param height The height of the world in pixels.
 * @param resolution The size of each height map cell in pixels.
 * @returns A 2D array of numbers representing the height map.
 */
export function generateHeightMap(width: number, height: number, resolution: number): number[][] {
  const gridWidth = Math.ceil(width / resolution);
  const gridHeight = Math.ceil(height / resolution);
  const heightMap: number[][] = Array.from({ length: gridHeight }, () => new Array(gridWidth).fill(0));
  const noise = createNoise2D();

  // Controls the "zoom" level of the noise. Smaller values result in smoother, larger features.
  const noiseScale = 0.005;

  for (let y = 0; y < gridHeight; y++) {
    for (let x = 0; x < gridWidth; x++) {
      const worldX = x * resolution;
      const worldY = y * resolution;
      // Use multiple octaves for more detailed terrain
      const noiseVal =
        noise(worldX * noiseScale, worldY * noiseScale) +
        0.5 * noise(worldX * noiseScale * 2, worldY * noiseScale * 2) +
        0.25 * noise(worldX * noiseScale * 4, worldY * noiseScale * 4);
      // Normalize the value to be between 0 and 1
      heightMap[y][x] = noiseVal / (1 + 0.5 + 0.25);
    }
  }

  return heightMap;
}

/**
 * Generates a biome map based on the height map.
 * @param heightMap The heightmap of the world.
 * @returns A 2D array of BiomeType enums.
 */
export function generateBiomeMap(heightMap: number[][]): BiomeType[][] {
  const gridHeight = heightMap.length;
  const gridWidth = heightMap[0]?.length ?? 0;
  const biomeMap: BiomeType[][] = Array.from({ length: gridHeight }, () => new Array(gridWidth));

  for (let y = 0; y < gridHeight; y++) {
    for (let x = 0; x < gridWidth; x++) {
      const height = heightMap[y][x];
      if (height > SNOW_LEVEL) {
        biomeMap[y][x] = BiomeType.SNOW;
      } else if (height > ROCK_LEVEL) {
        biomeMap[y][x] = BiomeType.ROCK;
      } else if (height > GRASS_LEVEL) {
        biomeMap[y][x] = BiomeType.GRASS;
      } else if (height > SAND_LEVEL) {
        biomeMap[y][x] = BiomeType.SAND;
      } else if (height > WATER_LEVEL) {
        biomeMap[y][x] = BiomeType.GROUND;
      } else {
        // Water is not a biome type, but could be handled here if needed
        biomeMap[y][x] = BiomeType.GROUND; // Default to ground for below-water cells
      }
    }
  }

  return biomeMap;
}

/**
 * Generates tree entities based on the biome map.
 * Trees spawn on GRASS biome cells with a probability of TREE_SPAWN_DENSITY.
 * @param entities The entity manager to add trees to.
 * @param biomeMap The biome map of the world.
 * @param resolution The size of each map cell in pixels.
 */
export function generateTrees(entities: Entities, biomeMap: BiomeType[][], resolution: number): void {
  const gridHeight = biomeMap.length;
  const gridWidth = biomeMap[0]?.length ?? 0;

  for (let y = 0; y < gridHeight; y++) {
    for (let x = 0; x < gridWidth; x++) {
      const biome = biomeMap[y][x];

      // Only spawn trees on grass
      if (biome === BiomeType.GRASS) {
        // Random chance to spawn a tree
        if (Math.random() < TREE_SPAWN_DENSITY) {
          const worldX = x * resolution + Math.random() * resolution;
          const worldY = y * resolution + Math.random() * resolution;

          createEntity(entities, EntityType.TREE, {
            position: { x: worldX, y: worldY },
            radius: TREE_RADIUS,
          });
        }
      }
    }
  }
}

/**
 * Initializes and returns a new, empty game world state.
 * This serves as the factory for creating a new game instance.
 */
export function initWorld(): GameWorldState {
  const entities = createEntities();
  const heightMap = generateHeightMap(MAP_WIDTH, MAP_HEIGHT, HEIGHT_MAP_RESOLUTION);
  const biomeMap = generateBiomeMap(heightMap);

  // Generate trees based on the biome map
  generateTrees(entities, biomeMap, HEIGHT_MAP_RESOLUTION);

  const initialWorldState: GameWorldState = {
    time: 0,
    entities: entities,
    mapDimensions: {
      width: MAP_WIDTH,
      height: MAP_HEIGHT,
    },
    heightMap,
    biomeMap,
    viewportCenter: {
      x: MAP_WIDTH / 2,
      y: MAP_HEIGHT / 2,
    },
    viewportZoom: 1.0,
    isPaused: false,
    gameOver: false,
    performanceMetrics: {
      currentBucket: {
        renderTime: 0,
        worldUpdateTime: 0,
        aiUpdateTime: 0,
      },
      history: [],
    },
  };

  // Create a single demo entity at the center to validate the rendering pipeline
  createEntity(initialWorldState.entities, EntityType.DEMO, {
    position: { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 },
    radius: 30,
  });

  return initialWorldState;
}
