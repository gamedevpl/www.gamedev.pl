import { HumanEntity } from '../../entities/characters/human/human-types';
import { UpdateContext } from '../../world-types';
import { vectorDistance, vectorNormalize, vectorSubtract } from '../../utils/math-utils';
import { getRandomNearbyPosition } from '../../utils/world-utils';
import { HUMAN_AI_IDLE_WANDER_CHANCE, HUMAN_AI_WANDER_RADIUS, HUMAN_INTERACTION_RANGE } from '../../world-consts';
import { HumanAIStrategy } from './ai-strategy-types';

export class IdleWanderStrategy implements HumanAIStrategy {
  check(): boolean {
    // This strategy is a fallback, so it always applies if no other strategy has taken precedence.
    // The main AI loop will ensure this is called last.
    return true;
  }

  execute(human: HumanEntity, context: UpdateContext): void {
    const { gameState } = context;

    // If idle, maybe start wandering
    if (human.activeAction === 'idle' || !human.activeAction) {
      human.activeAction = 'idle'; // Ensure activeAction is set

      if (Math.random() < HUMAN_AI_IDLE_WANDER_CHANCE) {
        // Start wandering
        human.activeAction = 'moving';
        human.targetPosition = getRandomNearbyPosition(
          human.position,
          HUMAN_AI_WANDER_RADIUS,
          gameState.mapDimensions.width,
          gameState.mapDimensions.height,
        );
        const dirToTarget = vectorSubtract(human.targetPosition, human.position);
        human.direction = vectorNormalize(dirToTarget);
      } else {
        // Stay idle
        human.direction = { x: 0, y: 0 };
        human.targetPosition = undefined;
      }
      return;
    }

    // If wandering (moving without a specific gathering/eating purpose)
    if (human.activeAction === 'moving' && human.targetPosition) {
      const distanceToTarget = vectorDistance(human.position, human.targetPosition);

      // Arrived at wander destination
      if (distanceToTarget < HUMAN_INTERACTION_RANGE) {
        human.activeAction = 'idle';
        human.targetPosition = undefined;
        human.direction = { x: 0, y: 0 };
      }
      return; // Continue wandering or just switched to idle
    }

    // Fallback: If somehow reached here with an undefined state, or an action not handled above (e.g. mid-eating/gathering but this strategy was forced)
    // It is assumed higher priority strategies would have handled eating/gathering.
    // If activeAction is something else, it might be an issue, but for now, reset to idle.
    if (human.activeAction !== 'moving') {
      // If not moving (wandering), and not idle (handled above), reset to idle as a safe default.
      human.activeAction = 'idle';
      human.direction = { x: 0, y: 0 };
      human.targetPosition = undefined;
    }
  }
}
