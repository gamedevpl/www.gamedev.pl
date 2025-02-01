import { createEntities, entitiesUpdate } from './entities/entities-update';
import { metricsAggregator } from '../../../utils/metrics/metrics-aggregator';
import { environmentInit, environmentUpdate } from './environment/environment-update';
import { GameWorldState, UpdateContext } from './game-world-types';
import { interactionsUpdate } from './interactions/interactions-update';

export function gameWorldUpdate(updateContext: UpdateContext): GameWorldState {
  if (updateContext.gameState.gameOver) {
    return updateContext.gameState;
  }

  interactionsUpdate(updateContext);

  entitiesUpdate(updateContext);

  environmentUpdate(updateContext);

  updateContext.gameState.time += updateContext.deltaTime;
  
  metricsAggregator.aggregateAndSend();
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
