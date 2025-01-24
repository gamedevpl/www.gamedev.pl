import { UpdateContext } from '../game-world-types';
import { Entity } from './entities-types';

const HUNGER_DECREASE_RATE = 0.0025; // Rate at which hunger decreases per millisecond

export function lionUpdate(entity: Entity, updateContext: UpdateContext) {
  const lion = entity as Entity & { hungerLevel: number }; // Explicitly cast to include hungerLevel

  // Update hunger level
  lion.hungerLevel = Math.max(lion.hungerLevel - HUNGER_DECREASE_RATE * updateContext.deltaTime, 0);

  // Check for starvation
  if (lion.hungerLevel === 0) {
    updateContext.gameState.gameOver = true;
    updateContext.gameState.gameOverStats = {
      timeSurvived: updateContext.gameState.time,
      deathCause: 'starvation',
    };
  }
}
