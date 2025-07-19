import {
  CHILD_MAX_WANDER_DISTANCE_FROM_PARENT,
  HUMAN_AI_IDLE_WANDER_CHANCE,
  HUMAN_AI_IDLE_WANDER_COOLDOWN,
  HUMAN_AI_WANDER_RADIUS,
  HUMAN_INTERACTION_PROXIMITY,
} from '../../../world-consts';
import { calculateWrappedDistance, getDirectionVectorOnTorus, vectorNormalize } from '../../../utils/math-utils';
import { findParents, getRandomNearbyPosition } from '../../../utils/world-utils';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { ActionNode } from '../nodes';

/**
 * Creates the behavior for idle wandering. This is a fallback action.
 * The entity has a chance to start wandering to a random nearby position.
 * If already wandering, it checks if it has arrived.
 * @returns A behavior node representing the idle/wander behavior.
 */
export function createIdleWanderBehavior(depth: number): BehaviorNode {
  return new ActionNode(
    (human, context, blackboard) => {
      // If idle, maybe start wandering
      if (human.activeAction === 'idle' || !human.activeAction) {
        const lastWanderTime = blackboard.get('lastWanderTime') ? Number(blackboard.get('lastWanderTime')) : 0;
        const timeSinceLastWander = context.gameState.time - lastWanderTime;
        if (Math.random() < HUMAN_AI_IDLE_WANDER_CHANCE && timeSinceLastWander > HUMAN_AI_IDLE_WANDER_COOLDOWN) {
          // Start wandering
          human.activeAction = 'moving';
          const parent = findParents(human, context.gameState)[0];
          human.target = getRandomNearbyPosition(
            !human.isAdult && parent ? parent.position : human.position,
            human.isAdult ? HUMAN_AI_WANDER_RADIUS : CHILD_MAX_WANDER_DISTANCE_FROM_PARENT,
            context.gameState.mapDimensions.width,
            context.gameState.mapDimensions.height,
          );
          const dirToTarget = getDirectionVectorOnTorus(
            human.position,
            human.target,
            context.gameState.mapDimensions.width,
            context.gameState.mapDimensions.height,
          );
          human.direction = vectorNormalize(dirToTarget);
          blackboard.set('wanderTarget', human.target);
          blackboard.set('lastWanderTime', context.gameState.time);
          return NodeStatus.SUCCESS;
        } else {
          // Stay idle
          human.direction = { x: 0, y: 0 };
          human.target = undefined;
          return [NodeStatus.FAILURE, String((HUMAN_AI_IDLE_WANDER_COOLDOWN - timeSinceLastWander) << 0)];
        }
      }

      if (blackboard.get('wanderTarget') !== human.target) {
        blackboard.set('wanderTarget', undefined);
        human.target = undefined;
        human.activeAction = 'idle';
      }

      // If wandering, check for arrival
      if (human.activeAction === 'moving' && typeof human.target === 'object') {
        const distanceToTarget = calculateWrappedDistance(
          human.position,
          human.target,
          context.gameState.mapDimensions.width,
          context.gameState.mapDimensions.height,
        );

        // Arrived at wander destination
        if (distanceToTarget < HUMAN_INTERACTION_PROXIMITY) {
          human.activeAction = 'idle';
          human.target = undefined;
          human.direction = { x: 0, y: 0 };
          blackboard.set('wanderTarget', undefined);
          return NodeStatus.SUCCESS;
        } else {
          return [NodeStatus.RUNNING, String(distanceToTarget << 0)];
        }
      }

      return NodeStatus.FAILURE;
    },
    'Idle/Wander',
    depth,
  );
}
