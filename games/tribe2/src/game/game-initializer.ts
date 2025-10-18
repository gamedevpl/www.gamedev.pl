import { createEntities, createEntity } from './ecs/entity-manager';
import { generateHeightMap } from './game-factory';
import { GameWorldState } from './types/game-types';
import { HEIGHT_MAP_RESOLUTION, MAP_WIDTH, MAP_HEIGHT } from './game-consts';

/**
 * Initializes the game world with its starting state.
 * @returns The initial state of the game world.
 */
export function initWorld(): GameWorldState {
  // 1. Initialize the entity manager
  const entities = createEntities();
  const heightMap = generateHeightMap(MAP_WIDTH, MAP_HEIGHT, HEIGHT_MAP_RESOLUTION);

  // 2. Create a player entity
  createEntity(entities, 'player', {
    position: { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 },
    radius: 10,
  });

  // 3. Create some boid entities for demonstration
  for (let i = 0; i < 20; i++) {
    createEntity(entities, 'boid', {
      position: {
        x: Math.random() * MAP_WIDTH,
        y: Math.random() * MAP_HEIGHT,
      },
      radius: 5 + Math.random() * 2,
    });
  }

  // 4. Assemble the initial game world state
  const initialState: GameWorldState = {
    time: 0, // Start at hour 0
    entities,
    mapDimensions: {
      width: MAP_WIDTH,
      height: MAP_HEIGHT,
    },
    heightMap,
    viewportCenter: { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 },
    viewportZoom: 1.0, // Initialize zoom at a neutral level
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

  return initialState;
}
