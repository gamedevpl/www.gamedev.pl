/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  PREY_FLEE_DISTANCE,
  PREY_INTERACTION_RANGE
} from '../../../animal-consts.ts';
import { PredatorEntity } from '../../../entities/characters/predator/predator-types';
import { HumanEntity } from '../../../entities/characters/human/human-types';
import {
  getDirectionVectorOnTorus,
  vectorAdd,
  vectorNormalize,
  vectorScale,
  calculateWrappedDistance,
} from '../../../utils/math-utils';
import { findClosestEntity } from '../../../utils/entity-finder-utils';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { ActionNode, ConditionNode, Sequence } from '../nodes';
import { UpdateContext } from '../../../world-types';
import { PreyEntity } from '../../../entities/characters/prey/prey-types';

/**
 * Creates a behavior sub-tree for prey fleeing from threats (predators and humans).
 */
export function createPreyFleeingBehavior(depth: number): BehaviorNode<PreyEntity> {
  return new Sequence(
    [
      // Condition: Should I flee?
      new ConditionNode(
        (prey, context: UpdateContext, blackboard) => {
          // Find the closest threat (predator or human)
          const closestPredator = findClosestEntity<PredatorEntity>(
            prey,
            context.gameState,
            'predator',
            PREY_INTERACTION_RANGE * 2,
            () => true, // All predators are threats
          );

          const closestHuman = findClosestEntity<HumanEntity>(
            prey,
            context.gameState,
            'human',
            PREY_INTERACTION_RANGE * 2,
            () => true, // All humans are threats
          );

          let closestThreat: PredatorEntity | HumanEntity | null = null;
          let closestDistance = Infinity;

          if (closestPredator) {
            const distance = calculateWrappedDistance(
              prey.position,
              closestPredator.position,
              context.gameState.mapDimensions.width,
              context.gameState.mapDimensions.height,
            );
            if (distance < closestDistance) {
              closestDistance = distance;
              closestThreat = closestPredator;
            }
          }

          if (closestHuman) {
            const distance = calculateWrappedDistance(
              prey.position,
              closestHuman.position,
              context.gameState.mapDimensions.width,
              context.gameState.mapDimensions.height,
            );
            if (distance < closestDistance) {
              closestDistance = distance;
              closestThreat = closestHuman;
            }
          }

          if (closestThreat && closestDistance < PREY_INTERACTION_RANGE * 1.5) {
            // Store the threat for the action node
            blackboard.set('fleeThreat', closestThreat);
            blackboard.set('fleeDistance', closestDistance);
            return true;
          }
          return false;
        },
        'Detect Threat',
        depth + 1,
      ),
      // Action: Flee from the threat
      new ActionNode(
        (prey, context: UpdateContext, blackboard) => {
          const threat = blackboard.get<PredatorEntity | HumanEntity>('fleeThreat');
          if (!threat) {
            return NodeStatus.FAILURE;
          }

          prey.activeAction = 'moving';

          // Calculate flee direction (directly away from threat)
          const fleeDirection = getDirectionVectorOnTorus(
            threat.position,
            prey.position,
            context.gameState.mapDimensions.width,
            context.gameState.mapDimensions.height,
          );

          const normalizedFleeDirection = vectorNormalize(fleeDirection);

          // Calculate target position far away in flee direction
          const targetPosition = vectorAdd(prey.position, vectorScale(normalizedFleeDirection, PREY_FLEE_DISTANCE));

          // Set wrapped target position
          prey.target = {
            x:
              ((targetPosition.x % context.gameState.mapDimensions.width) + context.gameState.mapDimensions.width) %
              context.gameState.mapDimensions.width,
            y:
              ((targetPosition.y % context.gameState.mapDimensions.height) + context.gameState.mapDimensions.height) %
              context.gameState.mapDimensions.height,
          };

          prey.direction = normalizedFleeDirection;

          // Set flee cooldown to prevent immediate re-fleeing
          prey.fleeCooldown = context.gameState.time + 2; // 2 hours cooldown

          return NodeStatus.RUNNING;
        },
        'Execute Flee',
        depth + 1,
      ),
    ],
    'Prey Flee',
    depth,
  );
}
