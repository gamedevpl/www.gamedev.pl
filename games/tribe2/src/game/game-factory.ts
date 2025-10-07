import { createEntities, createEntity } from './ecs/entity-manager';
import { MAP_HEIGHT, MAP_WIDTH } from './game-consts';
import { GameWorldState } from './types/game-types';

/**
 * Initializes and returns a new, empty game world state.
 * This serves as the factory for creating a new game instance.
 */
export function initWorld(): GameWorldState {
  const entities = createEntities();

  const initialWorldState: GameWorldState = {
    time: 0,
    entities: entities,
    mapDimensions: {
      width: MAP_WIDTH,
      height: MAP_HEIGHT,
    },
    viewportCenter: {
      x: MAP_WIDTH / 2,
      y: MAP_HEIGHT / 2,
    },
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
  createEntity(initialWorldState.entities, 'demo', {
    position: { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2 },
    radius: 30,
  });

  return initialWorldState;
}
