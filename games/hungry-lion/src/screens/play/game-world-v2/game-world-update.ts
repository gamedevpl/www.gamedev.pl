import { agenticUpdate } from './agentic/agentic-update';
import { createEntities, updateEntities } from './entities-update';
import { GameWorldState, UpdateContext } from './game-world-types';
import { interactionsUpdate } from './interactions/interactions-update';
import { PreySpawnConfig, spawnPrey } from './prey-spawner';

const DEFAULT_SPAWN_CONFIG: PreySpawnConfig = {
  maxCount: 10,
  minSpawnDistance: 100,
};

export function gameWorldUpdate(gameState: GameWorldState, updateContext: UpdateContext): GameWorldState {
  if (gameState.gameOver) {
    return gameState;
  }

  interactionsUpdate(gameState, updateContext);

  agenticUpdate(gameState, updateContext);

  updateEntities(gameState.entities, updateContext);

  // Spawn new prey if needed
  gameState.entities = spawnPrey(gameState.entities, gameState.spawnConfig);

  gameState.time += updateContext.deltaTime;
  return gameState;
}

export function gameWorldInit(): GameWorldState {
  return {
    entities: createEntities(),
    time: 0,
    gameOver: false,
    spawnConfig: DEFAULT_SPAWN_CONFIG,
  };
}
