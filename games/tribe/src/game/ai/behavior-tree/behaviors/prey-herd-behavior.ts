/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  PREY_INTERACTION_RANGE
} from '../../../animal-consts.ts';
import { PreyEntity } from '../../../entities/characters/prey/prey-types';
import { calculateWrappedDistance, getDirectionVectorOnTorus, vectorNormalize } from '../../../utils/math-utils';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { ActionNode, ConditionNode, Sequence } from '../nodes';
import { UpdateContext } from '../../../world-types';

/**
 * Creates a behavior sub-tree for prey herding behavior.
 * Prey naturally form large herds for protection, following the largest nearby groups.
 */
export function createPreyHerdBehavior(depth: number): BehaviorNode<PreyEntity> {
  return new Sequence(
    [
      // Condition: Should I join/follow the herd?
      new ConditionNode(
        (prey, context: UpdateContext, blackboard) => {
          // Only engage in herding when safe and not busy
          if (
            prey.hunger > 90 || // Too hungry to socialize
            prey.hitpoints < prey.maxHitpoints * 0.3 || // Too injured
            prey.activeAction === 'grazing' ||
            prey.activeAction === 'procreating'
          ) {
            return false;
          }

          // Find nearby prey to form/join herd
          const nearbyPrey = context.gameState.entities.entities.values();
          const herdMembers: PreyEntity[] = [];

          for (const entity of nearbyPrey) {
            if (entity.type === 'prey' && entity.id !== prey.id) {
              const otherPrey = entity as PreyEntity;
              if (otherPrey.hitpoints > 0 && otherPrey.isAdult) {
                const distance = calculateWrappedDistance(
                  prey.position,
                  otherPrey.position,
                  context.gameState.mapDimensions.width,
                  context.gameState.mapDimensions.height,
                );

                // Include in herd consideration if reasonably close
                if (distance <= PREY_INTERACTION_RANGE * 5) {
                  herdMembers.push(otherPrey);
                }
              }
            }
          }

          // Find the center of the largest nearby group
          if (herdMembers.length >= 2) {
            // Calculate herd center
            let centerX = 0;
            let centerY = 0;
            for (const member of herdMembers) {
              centerX += member.position.x;
              centerY += member.position.y;
            }
            centerX /= herdMembers.length;
            centerY /= herdMembers.length;

            const herdCenter = { x: centerX, y: centerY };
            const distanceToHerd = calculateWrappedDistance(
              prey.position,
              herdCenter,
              context.gameState.mapDimensions.width,
              context.gameState.mapDimensions.height,
            );

            // Join herd if too far from the group
            if (distanceToHerd > PREY_INTERACTION_RANGE * 2) {
              blackboard.set('herdCenter', herdCenter);
              blackboard.set('herdSize', herdMembers.length);
              return true;
            }
          }

          return false;
        },
        'Find Herd',
        depth + 1,
      ),
      // Action: Move towards herd center
      new ActionNode(
        (prey, context: UpdateContext, blackboard) => {
          const herdCenter = blackboard.get<{ x: number; y: number }>('herdCenter');

          if (!herdCenter) {
            return NodeStatus.FAILURE;
          }

          const distance = calculateWrappedDistance(
            prey.position,
            herdCenter,
            context.gameState.mapDimensions.width,
            context.gameState.mapDimensions.height,
          );

          // Move closer to herd center if too far
          if (distance > PREY_INTERACTION_RANGE * 2) {
            prey.activeAction = 'moving';
            prey.target = herdCenter;

            const directionToHerd = getDirectionVectorOnTorus(
              prey.position,
              herdCenter,
              context.gameState.mapDimensions.width,
              context.gameState.mapDimensions.height,
            );

            prey.direction = vectorNormalize(directionToHerd);
            return NodeStatus.RUNNING;
          } else {
            // Close enough to herd
            prey.activeAction = 'idle';
            prey.direction = { x: 0, y: 0 };
            return NodeStatus.SUCCESS;
          }
        },
        'Join Herd',
        depth + 1,
      ),
    ],
    'Prey Herd Behavior',
    depth,
  );
}
