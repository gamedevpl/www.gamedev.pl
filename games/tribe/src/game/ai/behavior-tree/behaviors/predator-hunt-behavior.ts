/* eslint-disable @typescript-eslint/no-explicit-any */
import { PREDATOR_HUNT_RANGE } from '../../../world-consts';
import { PreyEntity } from '../../../entities/characters/prey/prey-types';
import { calculateWrappedDistance, getDirectionVectorOnTorus, vectorNormalize } from '../../../utils/math-utils';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { ActionNode, ConditionNode, Sequence } from '../nodes';
import { UpdateContext } from '../../../world-types';

/**
 * Creates a behavior sub-tree for predators hunting prey.
 */
export function createPredatorHuntBehavior(depth: number): BehaviorNode {
  return new Sequence(
    [
      // Condition: Should I hunt?
      new ConditionNode(
        (predator: any, context: UpdateContext, blackboard) => {
          // Only hunt if moderately hungry and not on cooldown
          if (
            predator.hunger < 50 || 
            (predator.huntCooldown && predator.huntCooldown > 0)
          ) {
            return false;
          }

          // Find nearby prey
          let closestPrey: PreyEntity | null = null;
          let closestDistance = Infinity;

          context.gameState.entities.entities.forEach((entity) => {
            if (entity.type === 'prey') {
              const prey = entity as PreyEntity;
              if (prey.hitpoints > 0) { // Target must be alive
                const distance = calculateWrappedDistance(
                  predator.position,
                  prey.position,
                  context.gameState.mapDimensions.width,
                  context.gameState.mapDimensions.height,
                );
                
                if (distance < closestDistance) {
                  closestDistance = distance;
                  closestPrey = prey;
                }
              }
            }
          });

          if (closestPrey && closestDistance <= PREDATOR_HUNT_RANGE) {
            // Prey is within hunting range
            blackboard.set('huntTarget', closestPrey);
            return true;
          } else if (closestPrey && closestDistance <= PREDATOR_HUNT_RANGE * 2) {
            // Prey found but need to get closer
            blackboard.set('huntTarget', closestPrey);
            blackboard.set('needToApproach', true);
            return true;
          }
          
          return false;
        },
        'Find Prey Target',
        depth + 1,
      ),
      // Action: Hunt or approach prey
      new ActionNode(
        (predator: any, context: UpdateContext, blackboard) => {
          const target = blackboard.get<PreyEntity>('huntTarget');
          const needToApproach = blackboard.get<boolean>('needToApproach');
          
          if (!target || target.hitpoints <= 0) {
            return NodeStatus.FAILURE;
          }

          const distance = calculateWrappedDistance(
            predator.position,
            target.position,
            context.gameState.mapDimensions.width,
            context.gameState.mapDimensions.height,
          );

          if (distance <= PREDATOR_HUNT_RANGE) {
            // Within hunting range, start hunting
            predator.activeAction = 'hunting';
            predator.huntTargetId = target.id;
            predator.target = target.id;
            predator.direction = { x: 0, y: 0 };
            blackboard.delete('needToApproach');
            return NodeStatus.RUNNING;
          } else if (needToApproach || distance > PREDATOR_HUNT_RANGE) {
            // Need to move closer to the prey
            predator.activeAction = 'moving';
            predator.target = target.id;
            
            const directionToTarget = getDirectionVectorOnTorus(
              predator.position,
              target.position,
              context.gameState.mapDimensions.width,
              context.gameState.mapDimensions.height,
            );
            
            predator.direction = vectorNormalize(directionToTarget);
            return NodeStatus.RUNNING;
          }

          return NodeStatus.FAILURE;
        },
        'Hunt or Approach Prey',
        depth + 1,
      ),
    ],
    'Predator Hunt',
    depth,
  );
}