import { HumanAIStrategy } from './ai-strategy-types';
import { HumanEntity } from '../../entities/characters/human/human-types';
import { UpdateContext } from '../../world-types';
import { findClosestAggressor } from '../../utils/world-utils';
import { AI_FLEE_HEALTH_THRESHOLD, AI_FLEE_DISTANCE } from '../../world-consts';
import { getDirectionVectorOnTorus, vectorNormalize, vectorScale, vectorSubtract } from '../../utils/math-utils';

export class FleeingStrategy implements HumanAIStrategy<HumanEntity> {
  check(human: HumanEntity, context: UpdateContext): HumanEntity | null {
    if (human.hitpoints > human.maxHitpoints * AI_FLEE_HEALTH_THRESHOLD) {
      return null;
    }

    const aggressor = findClosestAggressor(human.id, context.gameState);
    if (aggressor) {
      return aggressor;
    }

    return null;
  }

  execute(human: HumanEntity, context: UpdateContext, threat: HumanEntity): void {
    human.activeAction = 'moving';

    // Calculate the direction vector away from the threat
    const fleeVector = getDirectionVectorOnTorus(
      threat.position,
      human.position,
      context.gameState.mapDimensions.width,
      context.gameState.mapDimensions.height,
    );

    const fleeDirection = vectorNormalize(fleeVector);

    // Calculate a target position far away in the flee direction
    const targetPosition = vectorSubtract(human.position, vectorScale(fleeDirection, AI_FLEE_DISTANCE));

    human.targetPosition = {
      x:
        ((targetPosition.x % context.gameState.mapDimensions.width) + context.gameState.mapDimensions.width) %
        context.gameState.mapDimensions.width,
      y:
        ((targetPosition.y % context.gameState.mapDimensions.height) + context.gameState.mapDimensions.height) %
        context.gameState.mapDimensions.height,
    };

    human.direction = fleeDirection;
  }
}
