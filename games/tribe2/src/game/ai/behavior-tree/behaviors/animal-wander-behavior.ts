import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { ActionNode } from '../nodes';
import { UpdateContext } from '../../../world-types';
import { vectorNormalize } from '../../../utils/math-utils';
import { PredatorEntity } from '../../../entities/characters/predator/predator-types';
import { PreyEntity } from '../../../entities/characters/prey/prey-types';
import { Blackboard } from '../behavior-tree-blackboard';
import { getRandomNearbyPositionPreferringPaths } from '../../../utils/spatial-utils';

/** Minimum wander distance for animals */
const ANIMAL_WANDER_MIN_DISTANCE = 50;
/** Maximum wander distance for animals */
const ANIMAL_WANDER_MAX_DISTANCE = 150;
/** Average wander radius for path preference calculation */
const ANIMAL_WANDER_RADIUS = (ANIMAL_WANDER_MIN_DISTANCE + ANIMAL_WANDER_MAX_DISTANCE) / 2;

/**
 * Creates a behavior for animals to wander around when idle.
 * This is a fallback behavior that keeps animals moving in a random pattern,
 * with a subtle preference for already depleted soil to encourage path formation.
 */
export function createAnimalWanderBehavior(depth: number): BehaviorNode<PreyEntity | PredatorEntity> {
  return new ActionNode(
    (animal, context: UpdateContext, blackboard) => {
      animal.activeAction = 'idle';

      // Get or create wander target
      let wanderTarget = Blackboard.get<{ x: number; y: number }>(blackboard, 'wanderTarget');
      let wanderStartTime = Blackboard.get<number>(blackboard, 'wanderStartTime');

      const currentTime = context.gameState.time;
      const { width: worldWidth, height: worldHeight } = context.gameState.mapDimensions;

      // Create new wander target if none exists or if we've been wandering for too long
      if (!wanderTarget || !wanderStartTime || currentTime - wanderStartTime > 2) {
        // Generate a random nearby position, preferring already depleted soil (existing paths)
        wanderTarget = getRandomNearbyPositionPreferringPaths(
          animal.position,
          ANIMAL_WANDER_RADIUS,
          worldWidth,
          worldHeight,
          context.gameState.soilDepletion,
        );

        Blackboard.set(blackboard, 'wanderTarget', wanderTarget);
        Blackboard.set(blackboard, 'wanderStartTime', currentTime);
      }

      // Move towards wander target
      if (wanderTarget) {
        animal.target = wanderTarget;

        // Calculate direction to target (with world wrapping)
        let dx = wanderTarget.x - animal.position.x;
        let dy = wanderTarget.y - animal.position.y;

        // Handle world wrapping
        if (Math.abs(dx) > worldWidth / 2) {
          dx = dx > 0 ? dx - worldWidth : dx + worldWidth;
        }
        if (Math.abs(dy) > worldHeight / 2) {
          dy = dy > 0 ? dy - worldHeight : dy + worldHeight;
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
