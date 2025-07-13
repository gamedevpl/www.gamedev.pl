import { HumanEntity } from '../../entities/characters/human/human-types';
import { UpdateContext } from '../../world-types';
import { Goal, GoalType } from '../goals/goal-types';
import { Action, ActionType } from './action-types';
import { findClosestAggressor } from '../../utils/world-utils';
import { AI_FLEE_HEALTH_THRESHOLD, AI_FLEE_DISTANCE } from '../../world-consts';
import { getDirectionVectorOnTorus, vectorNormalize, vectorScale, vectorAdd } from '../../utils/math-utils';

export const fleeAction: Action = {
  type: ActionType.FLEE,

  getUtility(human: HumanEntity, context: UpdateContext, goal: Goal): number {
    if (goal.type !== GoalType.DEFEND_SELF) {
      return 0;
    }

    // Fleeing is only an option if health is low and there's a direct threat.
    const isHealthLow = human.hitpoints < human.maxHitpoints * AI_FLEE_HEALTH_THRESHOLD;
    const aggressor = findClosestAggressor(human.id, context.gameState);

    if (isHealthLow && aggressor) {
      // High utility, as this is the primary action to preserve health when low.
      return 1.0;
    }

    return 0;
  },

  execute(human: HumanEntity, context: UpdateContext): void {
    const aggressor = findClosestAggressor(human.id, context.gameState);
    if (!aggressor) {
      // Should not happen if utility was > 0, but as a safeguard.
      human.activeAction = 'idle';
      return;
    }

    human.activeAction = 'moving';

    // Flee directly away from the threat
    const fleeFromThreatVector = getDirectionVectorOnTorus(
      aggressor.position,
      human.position,
      context.gameState.mapDimensions.width,
      context.gameState.mapDimensions.height,
    );

    const fleeDirection = vectorNormalize(fleeFromThreatVector);

    // Calculate a target position far away in the flee direction
    const targetPosition = vectorAdd(human.position, vectorScale(fleeDirection, AI_FLEE_DISTANCE));

    // Wrap the target position to stay within world bounds
    human.targetPosition = {
      x:
        ((targetPosition.x % context.gameState.mapDimensions.width) + context.gameState.mapDimensions.width) %
        context.gameState.mapDimensions.width,
      y:
        ((targetPosition.y % context.gameState.mapDimensions.height) + context.gameState.mapDimensions.height) %
        context.gameState.mapDimensions.height,
    };

    human.direction = fleeDirection;
    human.attackTargetId = undefined; // Stop focusing on any attack target
  },
};
