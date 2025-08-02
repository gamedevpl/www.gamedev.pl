 
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { ActionNode } from '../nodes';
import { UpdateContext } from '../../../world-types';
import { vectorAdd, vectorScale, vectorNormalize } from '../../../utils/math-utils';
import { PredatorEntity } from '../../../entities/characters/predator/predator-types';
import { PreyEntity } from '../../../entities/characters/prey/prey-types';

/**
 * Creates a behavior for animals to wander around when idle.
 * This is a fallback behavior that keeps animals moving in a random pattern.
 */
export function createAnimalWanderBehavior(depth: number): BehaviorNode<PreyEntity | PredatorEntity> {
  return new ActionNode(
    (animal, context: UpdateContext, blackboard) => {
      animal.activeAction = 'idle';

      // Get or create wander target
      let wanderTarget = blackboard.get<{ x: number; y: number }>('wanderTarget');
      let wanderStartTime = blackboard.get<number>('wanderStartTime');

      const currentTime = context.gameState.time;

      // Create new wander target if none exists or if we've been wandering for too long
      if (!wanderTarget || !wanderStartTime || currentTime - wanderStartTime > 2) {
        // Generate a random direction
        const angle = Math.random() * 2 * Math.PI;
        const distance = 50 + Math.random() * 100; // Random distance between 50-150 units

        const wanderDirection = {
          x: Math.cos(angle),
          y: Math.sin(angle),
        };

        // Calculate target position
        const targetPosition = vectorAdd(animal.position, vectorScale(wanderDirection, distance));

        // Wrap target around world boundaries
        wanderTarget = {
          x:
            ((targetPosition.x % context.gameState.mapDimensions.width) + context.gameState.mapDimensions.width) %
            context.gameState.mapDimensions.width,
          y:
            ((targetPosition.y % context.gameState.mapDimensions.height) + context.gameState.mapDimensions.height) %
            context.gameState.mapDimensions.height,
        };

        blackboard.set('wanderTarget', wanderTarget);
        blackboard.set('wanderStartTime', currentTime);
      }

      // Move towards wander target
      if (wanderTarget) {
        animal.target = wanderTarget;

        // Calculate direction to target (with world wrapping)
        let dx = wanderTarget.x - animal.position.x;
        let dy = wanderTarget.y - animal.position.y;

        // Handle world wrapping
        const mapWidth = context.gameState.mapDimensions.width;
        const mapHeight = context.gameState.mapDimensions.height;

        if (Math.abs(dx) > mapWidth / 2) {
          dx = dx > 0 ? dx - mapWidth : dx + mapWidth;
        }
        if (Math.abs(dy) > mapHeight / 2) {
          dy = dy > 0 ? dy - mapHeight : dy + mapHeight;
        }

        const direction = vectorNormalize({ x: dx, y: dy });
        animal.direction = direction;
      }

      return NodeStatus.SUCCESS; // Always succeeds as it's a fallback behavior
    },
    'Animal Wander',
    depth,
  );
}
