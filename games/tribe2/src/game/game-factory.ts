import { createEntities, createEntity } from './ecs/entity-manager';
import {
  HEIGHT_MAP_RESOLUTION,
  MAP_HEIGHT,
  MAP_WIDTH,
  TERRAIN_EDIT_BRUSH_RADIUS,
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
 * The generated map is seamless, meaning the left/right and top/bottom edges connect smoothly.
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

  // The periods for the base frequency, defining the seamless wrapping distance
  const periodX = width * noiseScale;
  const periodY = height * noiseScale;

  // Helper functions for seamless noise generation
  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  const lerp = (t: number, a: number, b: number) => a + t * (b - a);

  /**
   * Generates a single sample of 2D seamless noise by blending four noise samples.
   * @param nx The x-coordinate in noise space.
   * @param ny The y-coordinate in noise space.
   * @param periodX The period over which the noise should tile on the x-axis.
   * @param periodY The period over which the noise should tile on the y-axis.
   * @returns A single seamless noise value.
   */
  const seamlessNoise = (nx: number, ny: number, periodX: number, periodY: number): number => {
    // Fractional coordinates [0, 1] for blending
    const s = nx / periodX;
    const t = ny / periodY;

    // Blend weights using the fade curve
    const u = fade(s);
    const v = fade(t);

    // Sample noise at the four corners of the tile
    const n1 = noise(nx, ny); // Top-left
    const n2 = noise(nx - periodX, ny); // Top-right (wrapped)
    const n3 = noise(nx, ny - periodY); // Bottom-left (wrapped)
    const n4 = noise(nx - periodX, ny - periodY); // Bottom-right (wrapped)

    // Bilinear interpolation using the blend weights
    const p1 = lerp(u, n1, n2); // Interpolate along x for top edge
    const p2 = lerp(u, n3, n4); // Interpolate along x for bottom edge
    return lerp(v, p1, p2); // Interpolate along y
  };

  for (let y = 0; y < gridHeight; y++) {
    for (let x = 0; x < gridWidth; x++) {
      const worldX = x * resolution;
      const worldY = y * resolution;

      const nx = worldX * noiseScale;
      const ny = worldY * noiseScale;

      // Use multiple octaves for more detailed terrain.
      // Each octave uses a higher frequency and a correspondingly larger period for seamless tiling.
      const noiseVal =
        1.0 * seamlessNoise(nx, ny, periodX, periodY) +
        0.5 * seamlessNoise(nx * 2, ny * 2, periodX * 2, periodY * 2) +
        0.25 * seamlessNoise(nx * 4, ny * 4, periodX * 4, periodY * 4);

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
    terrainEditingMode: false,
    biomeEditingMode: false,
    selectedBiome: BiomeType.GRASS,
    editorBrush: {
      position: { x: 0, y: 0 },
      radius: TERRAIN_EDIT_BRUSH_RADIUS,
    },
    wireframeMode: false,
  };

  // Create a single demo entity at the center to validate the rendering pipeline
  createEntity(initialWorldState.entities, EntityType.DEMO, {
    position: { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 },
    radius: 30,
  });

  return initialWorldState;
}
