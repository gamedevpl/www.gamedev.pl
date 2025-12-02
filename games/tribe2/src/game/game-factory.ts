import { createEntities, createBerryBush, createHuman, createPrey, createPredator } from './entities/entities-update';
import { createEntity } from './ecs/entity-manager';
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
  RABBIT_RADIUS,
  RABBIT_SPAWN_DENSITY,
} from './constants/world-constants';
import { BiomeType, RoadPiece } from './world-types';
import { Entities } from './world-types';
import { createNoise2D } from './utils/noise-utils';
import { createRabbitBehaviorTree } from './ai/rabbit-ai';
import { DebugPanelType, GameWorldState } from './world-types';
import { INITIAL_BERRY_BUSH_COUNT, MIN_BERRY_BUSH_SPREAD_CHANCE } from './berry-bush-consts.ts';
import { INITIAL_MASTER_VOLUME } from './sound-consts.ts';
import { UI_BUTTON_WIDTH, UI_BUTTON_TEXT_COLOR } from './ui-consts.ts';
import { INTRO_SCREEN_INITIAL_HUMANS } from './game-consts.ts';
import {
  INITIAL_PREY_COUNT,
  MAX_PREY_GESTATION_PERIOD,
  MAX_PREY_PROCREATION_COOLDOWN,
  MAX_PREDATOR_GESTATION_PERIOD,
  MAX_PREDATOR_PROCREATION_COOLDOWN,
  MAX_PREY_HUNGER_INCREASE_PER_HOUR,
  MAX_PREDATOR_HUNGER_INCREASE_PER_HOUR,
} from './animal-consts.ts';
import { indexWorldState } from './world-index/world-state-index';
import { createTutorial, createTutorialState } from './tutorial';
import { ClickableUIButton, UIButtonActionType } from './ui/ui-types';
import { NotificationType } from './notifications/notification-types';
import { generateRandomPreyGeneCode } from './entities/characters/prey/prey-utils';
import { generateRandomPredatorGeneCode } from './entities/characters/predator/predator-utils';

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

          createEntity(entities, 'tree', {
            position: { x: worldX, y: worldY },
            radius: TREE_RADIUS,
          });
        }
      }
    }
  }
}

/**
 * Generates rabbit entities based on the biome map.
 * Rabbits spawn on GRASS biome cells with a probability of RABBIT_SPAWN_DENSITY.
 * @param entities The entity manager to add rabbits to.
 * @param biomeMap The biome map of the world.
 * @param resolution The size of each map cell in pixels.
 */
export function generateRabbits(entities: Entities, biomeMap: BiomeType[][], resolution: number): void {
  const gridHeight = biomeMap.length;
  const gridWidth = biomeMap[0]?.length ?? 0;

  for (let y = 0; y < gridHeight; y++) {
    for (let x = 0; x < gridWidth; x++) {
      const biome = biomeMap[y][x];

      // Only spawn rabbits on grass
      if (biome === BiomeType.GRASS) {
        // Random chance to spawn a rabbit
        if (Math.random() < RABBIT_SPAWN_DENSITY) {
          const worldX = x * resolution + Math.random() * resolution;
          const worldY = y * resolution + Math.random() * resolution;

          createEntity(entities, 'rabbit', {
            position: { x: worldX, y: worldY },
            radius: RABBIT_RADIUS,
            behaviorTree: createRabbitBehaviorTree(),
            needs: {
              hunger: 0,
              thirst: 0,
              maxHunger: 100,
              maxThirst: 100,
            },
          });
        }
      }
    }
  }
}

/**
 * Initializes and returns a new, empty game world state with Tribe1 game mechanics.
 * This serves as the factory for creating a new game instance.
 */
export function initWorld(): GameWorldState {
  const entities = createEntities();
  const initialTime = 0; // Game starts at time 0
  const heightMap = generateHeightMap(MAP_WIDTH, MAP_HEIGHT, HEIGHT_MAP_RESOLUTION);
  const biomeMap = generateBiomeMap(heightMap);
  const gridHeight = heightMap.length;
  const gridWidth = heightMap[0]?.length ?? 0;
  const roadMap: (RoadPiece | null)[][] = Array.from({ length: gridHeight }, () => new Array(gridWidth).fill(null));

  // Generate trees based on the biome map
  generateTrees(entities, biomeMap, HEIGHT_MAP_RESOLUTION);

  // Generate rabbits based on the biome map  
  generateRabbits(entities, biomeMap, HEIGHT_MAP_RESOLUTION);

  // Spawn initial berry bushes
  for (let i = 0; i < INITIAL_BERRY_BUSH_COUNT; i++) {
    const randomPosition = {
      x: Math.random() * MAP_WIDTH,
      y: Math.random() * MAP_HEIGHT,
    };
    createBerryBush(entities, randomPosition, initialTime);
  }

  // Define the center of the map for character spawning
  const centerX = MAP_WIDTH / 2;
  const centerY = MAP_HEIGHT / 2;

  // Spawn player character (male) at center
  const player = createHuman(entities, { x: centerX, y: centerY }, initialTime, 'male', true);

  // Spawn partner character (female) near the player
  createHuman(
    entities,
    { x: centerX + 50, y: centerY },
    initialTime,
    'female',
    false, // isPlayer = false
  );

  // Spawn pairs of prey at random positions
  for (let i = 0; i < INITIAL_PREY_COUNT; i++) {
    const preyMalePosition = {
      x: centerX + MAP_WIDTH * (Math.random() - Math.random()),
      y: centerY + MAP_HEIGHT * (Math.random() - Math.random()),
    };
    createPrey(entities, preyMalePosition, 'male', undefined, undefined, generateRandomPreyGeneCode());
    createPrey(
      entities,
      { x: preyMalePosition.x + 20, y: preyMalePosition.y },
      'female',
      undefined,
      undefined,
      generateRandomPreyGeneCode(),
    );
  }

  // Spawn a pair of predators
  const predatorMalePosition = {
    x: centerX + MAP_WIDTH * (Math.random() - Math.random()),
    y: centerY + MAP_HEIGHT * (Math.random() - Math.random()),
  };
  createPredator(entities, predatorMalePosition, 'male', undefined, undefined, generateRandomPredatorGeneCode());
  createPredator(
    entities,
    { x: predatorMalePosition.x + 20, y: predatorMalePosition.y },
    'female',
    undefined,
    undefined,
    generateRandomPredatorGeneCode(),
  );

  const uiButtons: ClickableUIButton[] = [
    {
      id: 'muteButton',
      action: UIButtonActionType.ToggleMute,
      currentWidth: UI_BUTTON_WIDTH,
      rect: { x: 0, y: 0, width: 0, height: 0 },
      text: '',
      backgroundColor: '',
      textColor: UI_BUTTON_TEXT_COLOR,
    },
    {
      id: 'pauseButton',
      action: UIButtonActionType.TogglePause,
      currentWidth: UI_BUTTON_WIDTH,
      rect: { x: 0, y: 0, width: 0, height: 0 },
      text: '',
      backgroundColor: '',
      textColor: UI_BUTTON_TEXT_COLOR,
    },
    {
      id: 'returnToIntroButton',
      action: UIButtonActionType.ReturnToIntro,
      currentWidth: UI_BUTTON_WIDTH,
      rect: { x: 0, y: 0, width: 0, height: 0 },
      text: 'EXIT',
      backgroundColor: '',
      textColor: UI_BUTTON_TEXT_COLOR,
    },
  ];

  const tutorial = createTutorial();
  const tutorialState = createTutorialState();

  const initialWorldState: GameWorldState = {
    time: initialTime,
    entities: entities,
    mapDimensions: {
      width: MAP_WIDTH,
      height: MAP_HEIGHT,
    },
    heightMap,
    biomeMap,
    roadMap,
    generationCount: 1, // Start with generation 1 as per GDD context for player
    gameOver: false,
    visualEffects: [],
    nextVisualEffectId: 0,
    viewportCenter: { ...player.position },
    viewportZoom: 1.0,
    isPaused: false,
    exitConfirmation: 'inactive',
    autopilotControls: {
      behaviors: {
        procreation: false,
        planting: false,
        gathering: false,
        attack: false,
        feedChildren: true,
        followLeader: false,
      },
      hoveredAutopilotAction: undefined,
      activeAutopilotAction: undefined,
      isManuallyMoving: false,
    },
    hasPlayerMovedEver: false,
    hasPlayerPlantedBush: false,
    hasPlayerEnabledAutopilot: 0,
    masterVolume: INITIAL_MASTER_VOLUME,
    isMuted: false,
    uiButtons,
    tutorial,
    tutorialState,
    debugPanel: DebugPanelType.None,
    performanceMetrics: {
      currentBucket: {
        renderTime: 0,
        worldUpdateTime: 0,
        aiUpdateTime: 0,
      },
      history: [],
    },
    hoveredButtonId: undefined,
    mousePosition: { x: 0, y: 0 },
    notifications: [
      {
        id: 'welcome',
        type: NotificationType.Hello,
        message: 'Welcome to the game!',
        duration: 50,
        targetEntityIds: [player.id],
        highlightedEntityIds: [player.id],
        timestamp: 0,
        isDismissed: false,
        creationTime: Date.now(),
      },
    ],
    ecosystem: {
      preyGestationPeriod: MAX_PREY_GESTATION_PERIOD,
      preyProcreationCooldown: MAX_PREY_PROCREATION_COOLDOWN,
      predatorGestationPeriod: MAX_PREDATOR_GESTATION_PERIOD,
      predatorProcreationCooldown: MAX_PREDATOR_PROCREATION_COOLDOWN,
      preyHungerIncreasePerHour: MAX_PREY_HUNGER_INCREASE_PER_HOUR,
      predatorHungerIncreasePerHour: MAX_PREDATOR_HUNGER_INCREASE_PER_HOUR,
      berryBushSpreadChance: MIN_BERRY_BUSH_SPREAD_CHANCE,
    },
    terrainEditingMode: false,
    biomeEditingMode: false,
    wireframeMode: false,
    roadEditingMode: false,
    buildingPlacementMode: false,
  };

  const indexedWorldState = indexWorldState(initialWorldState);

  console.log('Game world initialized:', indexedWorldState);

  return indexedWorldState;
}

/**
 * Initializes the intro world with AI-controlled entities for the intro screen.
 */
export function initIntroWorld(): GameWorldState {
  const entities = createEntities();
  const initialTime = 0;
  const heightMap = generateHeightMap(MAP_WIDTH, MAP_HEIGHT, HEIGHT_MAP_RESOLUTION);
  const biomeMap = generateBiomeMap(heightMap);
  const gridHeight = heightMap.length;
  const gridWidth = heightMap[0]?.length ?? 0;
  const roadMap: (RoadPiece | null)[][] = Array.from({ length: gridHeight }, () => new Array(gridWidth).fill(null));

  // Generate trees based on the biome map
  generateTrees(entities, biomeMap, HEIGHT_MAP_RESOLUTION);

  // Generate rabbits based on the biome map
  generateRabbits(entities, biomeMap, HEIGHT_MAP_RESOLUTION);

  // Spawn initial berry bushes
  for (let i = 0; i < INITIAL_BERRY_BUSH_COUNT; i++) {
    const randomPosition = {
      x: Math.random() * MAP_WIDTH,
      y: Math.random() * MAP_HEIGHT,
    };
    createBerryBush(entities, randomPosition, initialTime);
  }

  // Spawn initial AI humans
  for (let i = 0; i < INTRO_SCREEN_INITIAL_HUMANS; i++) {
    const randomPosition = {
      x: Math.random() * MAP_WIDTH,
      y: Math.random() * MAP_HEIGHT,
    };
    const gender = Math.random() < 0.5 ? 'male' : 'female';
    createHuman(entities, randomPosition, initialTime, gender, false);
  }

  // Spawn pairs of prey at random positions
  for (let i = 0; i < INITIAL_PREY_COUNT; i++) {
    const preyMalePosition = {
      x: Math.random() * MAP_WIDTH,
      y: Math.random() * MAP_HEIGHT,
    };
    createPrey(entities, preyMalePosition, 'male', undefined, undefined, generateRandomPreyGeneCode());
    createPrey(
      entities,
      { x: preyMalePosition.x + 20, y: preyMalePosition.y },
      'female',
      undefined,
      undefined,
      generateRandomPreyGeneCode(),
    );
  }

  // Spawn a pair of predators
  const predatorMalePosition = {
    x: Math.random() * MAP_WIDTH,
    y: Math.random() * MAP_HEIGHT,
  };
  createPredator(entities, predatorMalePosition, 'male', undefined, undefined, generateRandomPredatorGeneCode());
  createPredator(
    entities,
    { x: predatorMalePosition.x + 20, y: predatorMalePosition.y },
    'female',
    undefined,
    undefined,
    generateRandomPredatorGeneCode(),
  );

  const tutorial = createTutorial();
  const tutorialState = createTutorialState();

  const initialWorldState: GameWorldState = {
    time: initialTime,
    entities: entities,
    mapDimensions: {
      width: MAP_WIDTH,
      height: MAP_HEIGHT,
    },
    heightMap,
    biomeMap,
    roadMap,
    generationCount: 0,
    gameOver: false,
    visualEffects: [],
    nextVisualEffectId: 0,
    viewportCenter: { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 },
    viewportZoom: 1.0,
    isPaused: false,
    exitConfirmation: 'inactive',
    autopilotControls: {
      behaviors: {
        procreation: false,
        planting: false,
        gathering: false,
        attack: false,
        feedChildren: true,
        followLeader: false,
      },
      hoveredAutopilotAction: undefined,
      activeAutopilotAction: undefined,
      isManuallyMoving: false,
    },
    hasPlayerMovedEver: false,
    hasPlayerPlantedBush: false,
    hasPlayerEnabledAutopilot: 0,
    masterVolume: INITIAL_MASTER_VOLUME,
    isMuted: true, // Muted by default for the intro
    uiButtons: [], // No UI buttons in the intro
    tutorial,
    tutorialState,
    debugPanel: DebugPanelType.None,
    performanceMetrics: {
      currentBucket: {
        renderTime: 0,
        worldUpdateTime: 0,
        aiUpdateTime: 0,
      },
      history: [],
    },
    hoveredButtonId: undefined,
    mousePosition: { x: 0, y: 0 },
    notifications: [],
    ecosystem: {
      preyGestationPeriod: MAX_PREY_GESTATION_PERIOD,
      preyProcreationCooldown: MAX_PREY_PROCREATION_COOLDOWN,
      predatorGestationPeriod: MAX_PREDATOR_GESTATION_PERIOD,
      predatorProcreationCooldown: MAX_PREDATOR_PROCREATION_COOLDOWN,
      preyHungerIncreasePerHour: MAX_PREY_HUNGER_INCREASE_PER_HOUR,
      predatorHungerIncreasePerHour: MAX_PREDATOR_HUNGER_INCREASE_PER_HOUR,
      berryBushSpreadChance: MIN_BERRY_BUSH_SPREAD_CHANCE,
    },
    terrainEditingMode: false,
    biomeEditingMode: false,
    wireframeMode: false,
    roadEditingMode: false,
    buildingPlacementMode: false,
  };

  return indexWorldState(initialWorldState);
}
