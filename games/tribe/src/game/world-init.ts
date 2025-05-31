import { createEntities, createBerryBush } from "./entities/entities-update"; // Added createBerryBush
import { GameWorldState } from "./world-types";
import { MAP_WIDTH, MAP_HEIGHT, INITIAL_BERRY_BUSH_COUNT } from "./world-consts"; // Added INITIAL_BERRY_BUSH_COUNT

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

  const initialWorldState: GameWorldState = {
    time: initialTime,
    entities: entities,
    mapDimensions: {
      width: MAP_WIDTH,
      height: MAP_HEIGHT,
    },
    generationCount: 1, // Start with generation 1 as per GDD context for player
    gameOver: false,
  };

  // TODO: Initialize player character and partner as per GDD
  // Example (needs Character type and createCharacter function):
  // const player = createCharacter(initialWorldState.entities, { x: MAP_WIDTH / 2, y: MAP_HEIGHT / 2}, initialTime, true);
  // const partner = createCharacter(initialWorldState.entities, { x: MAP_WIDTH / 2 + 50, y: MAP_HEIGHT / 2}, initialTime, false);

  console.log("Game world initialized:", initialWorldState);

  return initialWorldState;
}
