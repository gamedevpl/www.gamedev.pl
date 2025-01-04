import { agenticUpdate } from './agentic-update';
import { createEntities } from './entities-update';
import { GameState, UpdateContext } from './game-world-types';
import { interactionsUpdate } from './interactions-update';

export function gameWorldUpdate(gameState: GameState, updateContext: UpdateContext): GameState {
  if (gameState.gameOver) {
    return gameState;
  }

  interactionsUpdate(gameState, updateContext);

  agenticUpdate(gameState, updateContext);

  gameState.time += updateContext.deltaTime;
  return gameState;
}

export function gameWorldInit(): GameState {
  return {
    entities: createEntities(),
    time: 0,
    gameOver: false,
  };
}
