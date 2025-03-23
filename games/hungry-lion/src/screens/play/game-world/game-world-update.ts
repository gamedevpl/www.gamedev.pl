import { createEntities, entitiesUpdate } from './entities/entities-update';
import { metricsAggregator } from '../../../utils/metrics/metrics-aggregator';
import { environmentInit, environmentUpdate } from './environment/environment-update';
import { GameWorldState, UpdateContext } from './game-world-types';
import { interactionsUpdate } from './interactions/interactions-update';
import { notificationsInit, notificationsUpdate } from './notifications/notifications-update';

export function gameWorldUpdate(updateContext: UpdateContext): GameWorldState {
  if (updateContext.gameState.gameOver) {
    return updateContext.gameState;
  }

  interactionsUpdate(updateContext);

  entitiesUpdate(updateContext);

  environmentUpdate(updateContext);
  
  // Update notifications (remove expired ones)
  notificationsUpdate(updateContext);

  updateContext.gameState.time += updateContext.deltaTime;
  
  metricsAggregator.aggregateAndSend();
  return updateContext.gameState;
}

export function gameWorldInit(): GameWorldState {
  return {
    entities: createEntities(),
    environment: environmentInit(),
    notifications: notificationsInit(),
    time: 0,
    gameOver: false,
  };
}