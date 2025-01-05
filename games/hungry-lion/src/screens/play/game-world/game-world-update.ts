import { agenticUpdate } from './agentic/agentic-update';
import { createEntities, updateEntities } from './entities/entities-update';
import { environmentInit, environmentUpdate } from './environment/environment-update';
import { GameWorldState, UpdateContext } from './game-world-types';
import { interactionsUpdate } from './interactions/interactions-update';

export function gameWorldUpdate(updateContext: UpdateContext): GameWorldState {
  if (updateContext.gameState.gameOver) {
    return updateContext.gameState;
  }

  interactionsUpdate(updateContext);

  agenticUpdate(updateContext);

  updateEntities(updateContext);

  environmentUpdate(updateContext);

  updateContext.gameState.time += updateContext.deltaTime;
  return updateContext.gameState;
}

export function gameWorldInit(): GameWorldState {
  return {
    entities: createEntities(),
    environment: environmentInit(),
    time: 0,
    gameOver: false,
  };
}
