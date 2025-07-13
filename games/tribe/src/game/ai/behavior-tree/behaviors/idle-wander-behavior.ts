import {
  CHILD_MAX_WANDER_DISTANCE_FROM_PARENT,
  HUMAN_AI_IDLE_WANDER_CHANCE,
  HUMAN_AI_WANDER_RADIUS,
  HUMAN_INTERACTION_PROXIMITY,
} from '../../../world-consts';
import { calculateWrappedDistance, getDirectionVectorOnTorus, vectorNormalize } from '../../../utils/math-utils';
import { getRandomNearbyPosition } from '../../../utils/world-utils';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { ActionNode } from '../nodes';

/**
 * Creates the behavior for idle wandering. This is a fallback action.
 * The entity has a chance to start wandering to a random nearby position.
 * If already wandering, it checks if it has arrived.
 * @returns A behavior node representing the idle/wander behavior.
 */
export function createIdleWanderBehavior(depth: number): BehaviorNode {
  return new ActionNode((human, context) => {
    // If idle, maybe start wandering
    if (human.activeAction === 'idle' || !human.activeAction) {
      if (Math.random() < HUMAN_AI_IDLE_WANDER_CHANCE) {
        // Start wandering
        human.activeAction = 'moving';
        human.targetPosition = getRandomNearbyPosition(
          human.position,
          human.isAdult ? HUMAN_AI_WANDER_RADIUS : CHILD_MAX_WANDER_DISTANCE_FROM_PARENT,
          context.gameState.mapDimensions.width,
          context.gameState.mapDimensions.height,
        );
        const dirToTarget = getDirectionVectorOnTorus(
          human.position,
          human.targetPosition,
          context.gameState.mapDimensions.width,
          context.gameState.mapDimensions.height,
        );
        human.direction = vectorNormalize(dirToTarget);
      } else {
        // Stay idle
        human.direction = { x: 0, y: 0 };
        human.targetPosition = undefined;
      }
      return NodeStatus.SUCCESS;
    }

    // If wandering, check for arrival
    if (human.activeAction === 'moving' && human.targetPosition) {
      const distanceToTarget = calculateWrappedDistance(
        human.position,
        human.targetPosition,
        context.gameState.mapDimensions.width,
        context.gameState.mapDimensions.height,
      );

      // Arrived at wander destination
      if (distanceToTarget < HUMAN_INTERACTION_PROXIMITY) {
        human.activeAction = 'idle';
        human.targetPosition = undefined;
        human.direction = { x: 0, y: 0 };
      }
    }

    return NodeStatus.SUCCESS; // This is a fallback, it always \\\"handles\\\" the state.
  }, 'Idle/Wander', depth);
}
