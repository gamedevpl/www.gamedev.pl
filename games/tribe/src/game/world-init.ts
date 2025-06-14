import { createEntities, createBerryBush, createHuman } from './entities/entities-update';
import { GameWorldState } from './world-types';
import { MAP_WIDTH, MAP_HEIGHT, INITIAL_BERRY_BUSH_COUNT } from './world-consts';
import { indexWorldState } from './world-index/world-state-index';

export function initWorld(): GameWorldState {
  const entities = createEntities();
  const initialTime = 0; // Game starts at time 0

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
  createHuman(
    entities,
    { x: centerX, y: centerY },
    initialTime,
    'male',
    true, // isPlayer = true
  );

  // Spawn partner character (female) near the player
  createHuman(
    entities,
    { x: centerX + 50, y: centerY },
    initialTime,
    'female',
    false, // isPlayer = false
  );

  const initialWorldState: GameWorldState = {
    time: initialTime,
    entities: entities,
    mapDimensions: {
      width: MAP_WIDTH,
      height: MAP_HEIGHT,
    },
    generationCount: 1, // Start with generation 1 as per GDD context for player
    gameOver: false,
    visualEffects: [],
    nextVisualEffectId: 0,
  };

  const indexedWorldState = indexWorldState(initialWorldState);

  console.log('Game world initialized:', indexedWorldState);

  return indexedWorldState;
}
