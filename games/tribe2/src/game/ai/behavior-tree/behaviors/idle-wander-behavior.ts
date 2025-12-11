import { HumanEntity } from '../../../entities/characters/human/human-types';
import { Blackboard } from '../behavior-tree-blackboard';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { ActionNode } from '../nodes';
import { getRandomNearbyPosition } from '../../../utils/spatial-utils';
import { vectorNormalize, calculateWrappedDistance } from '../../../utils/math-utils';
import { isValidWanderPosition, constrainWanderToTerritory } from '../../../entities/tribe/territory-utils';
import { HUMAN_AI_WANDER_RADIUS } from '../../../ai-consts';

/** Cooldown between wander target selections in game hours */
const WANDER_COOLDOWN_HOURS = 0.5;

/**
 * Creates the behavior for wandering within tribe territory. This is a fallback action.
 * The entity will move to random positions within their tribe's territory bounds.
 * @returns A behavior node representing the idle/wander behavior.
 */
export function createIdleWanderBehavior(depth: number): BehaviorNode<HumanEntity> {
  return new ActionNode(
    (human, context, blackboard) => {
      const { gameState } = context;
      const { width: worldWidth, height: worldHeight } = gameState.mapDimensions;

      // Get existing wander target and cooldown
      let wanderTarget = Blackboard.get<{ x: number; y: number }>(blackboard, 'wanderTarget');
      const lastWanderTime = Blackboard.get<number>(blackboard, 'lastWanderTime') ?? 0;
      const currentTime = gameState.time;

      // Check if we've reached the target or need a new one
      const needsNewTarget =
        !wanderTarget ||
        currentTime - lastWanderTime > WANDER_COOLDOWN_HOURS ||
        calculateWrappedDistance(human.position, wanderTarget, worldWidth, worldHeight) < 20;

      if (needsNewTarget) {
        // Generate a random nearby position
        const randomTarget = getRandomNearbyPosition(
          human.position,
          HUMAN_AI_WANDER_RADIUS,
          worldWidth,
          worldHeight,
        );

        // If the human has a tribe, constrain wandering to territory
        if (human.leaderId) {
          // First check if the target is valid
          if (!isValidWanderPosition(randomTarget, human.leaderId, gameState)) {
            // Constrain to territory
            wanderTarget = constrainWanderToTerritory(human.position, randomTarget, human.leaderId, gameState);
          } else {
            wanderTarget = randomTarget;
          }
        } else {
          // No tribe, can wander freely
          wanderTarget = randomTarget;
        }

        Blackboard.set(blackboard, 'wanderTarget', wanderTarget);
        Blackboard.set(blackboard, 'lastWanderTime', currentTime);
      }

      // Move towards wander target if we have one and it's not too close
      if (wanderTarget) {
        const distanceToTarget = calculateWrappedDistance(human.position, wanderTarget, worldWidth, worldHeight);

        if (distanceToTarget > 10) {
          human.activeAction = 'moving';
          human.target = wanderTarget;

          // Calculate direction with world wrapping
          let dx = wanderTarget.x - human.position.x;
          let dy = wanderTarget.y - human.position.y;

          if (Math.abs(dx) > worldWidth / 2) {
            dx = dx > 0 ? dx - worldWidth : dx + worldWidth;
          }
          if (Math.abs(dy) > worldHeight / 2) {
            dy = dy > 0 ? dy - worldHeight : dy + worldHeight;
          }

          human.direction = vectorNormalize({ x: dx, y: dy });
          return NodeStatus.RUNNING;
        }
      }

      // At target or no target - idle
      human.activeAction = 'idle';
      human.direction = { x: 0, y: 0 };
      human.target = undefined;
      return NodeStatus.SUCCESS;
    },
    'Idle/Wander',
    depth,
  );
}
