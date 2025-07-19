import {
  CHILD_MAX_WANDER_DISTANCE_FROM_PARENT,
  FAMILY_CENTER_MAX_WANDER_DISTANCE,
  HUMAN_AI_IDLE_WANDER_CHANCE,
  HUMAN_AI_IDLE_WANDER_COOLDOWN,
  HUMAN_AI_WANDER_RADIUS,
  HUMAN_INTERACTION_PROXIMITY,
  TRIBE_CENTER_MAX_WANDER_DISTANCE,
} from '../../../world-consts';
import { calculateWrappedDistance, getDirectionVectorOnTorus, vectorNormalize } from '../../../utils/math-utils';
import {
  findParents,
  getFamilyCenter,
  getFamilyMembers,
  getRandomNearbyPosition,
  getTribeCenter,
} from '../../../utils/world-utils';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { ActionNode } from '../nodes';
import { Vector2D } from '../../../utils/math-types';

/**
 * Creates the behavior for idle wandering. This is a fallback action.
 * The entity has a chance to start wandering to a random nearby position,
 * anchored to their tribe or family center to avoid straying too far.
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

          let homePosition: Vector2D;
          let wanderRadius: number;

          // Determine the anchor point for wandering
          if (human.leaderId) {
            homePosition = getTribeCenter(human.leaderId, context.gameState);
            wanderRadius = TRIBE_CENTER_MAX_WANDER_DISTANCE;
          } else {
            const familyMembers = getFamilyMembers(human, context.gameState);
            if (familyMembers.length > 0) {
              homePosition = getFamilyCenter(human, context.gameState);
              wanderRadius = FAMILY_CENTER_MAX_WANDER_DISTANCE;
            } else {
              // Loner fallback
              homePosition = human.position;
              wanderRadius = HUMAN_AI_WANDER_RADIUS;
            }
          }

          // Children without a tribe should prioritize staying near parents
          if (!human.isAdult && !human.leaderId) {
            const parents = findParents(human, context.gameState);
            if (parents.length > 0) {
              homePosition = parents[0].position;
              wanderRadius = CHILD_MAX_WANDER_DISTANCE_FROM_PARENT;
            }
          }

          human.target = getRandomNearbyPosition(
            homePosition,
            wanderRadius,
            context.gameState.mapDimensions.width,
            context.gameState.mapDimensions.height,
          );

          const dirToTarget = getDirectionVectorOnTorus(
            human.position,
            human.target as Vector2D,
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
          return [NodeStatus.FAILURE, String(((HUMAN_AI_IDLE_WANDER_COOLDOWN - timeSinceLastWander) << 0) as number)];
        }
      }

      if (blackboard.get('wanderTarget') !== human.target) {
        blackboard.set('wanderTarget', undefined);
        human.target = undefined;
        human.activeAction = 'idle';
      }

      // If wandering, check for arrival
      if (human.activeAction === 'moving' && human.target && typeof human.target === 'object' && 'x' in human.target) {
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
