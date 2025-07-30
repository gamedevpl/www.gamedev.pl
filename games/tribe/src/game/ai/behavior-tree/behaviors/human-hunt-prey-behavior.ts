import { HumanEntity } from '../../../entities/characters/human/human-types';
import { PreyEntity } from '../../../entities/characters/prey/prey-types';
import { UpdateContext } from '../../../world-types';
import { ActionNode, ConditionNode, Sequence } from '../nodes';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { Blackboard } from '../behavior-tree-blackboard';
import { calculateWrappedDistance } from '../../../utils/math-utils';
import { findClosestEntity } from '../../../utils';
import { HUMAN_ATTACKING } from '../../../entities/characters/human/states/human-state-types';

const HUNT_TARGET_KEY = 'huntTarget';
const HUNT_RANGE = 120; // Range to detect and hunt prey

/**
 * Creates a behavior tree branch for humans hunting prey for food.
 * Humans will hunt prey when they are hungry and see an opportunity.
 */
export function createHumanHuntPreyBehavior(depth: number): BehaviorNode {
  return new Sequence(
    [
      // 1. Condition: Should hunt prey?
      new ConditionNode(
        (human: HumanEntity, context: UpdateContext, blackboard: Blackboard) => {
          if (!human.isAdult) {
            return [false, 'Not an adult'];
          }

          // Only hunt if moderately hungry
          if (human.hunger < 60) {
            return [false, 'Not hungry enough to hunt'];
          }

          // Don't hunt if carrying too much food
          if (human.food.length >= human.maxFood - 2) {
            return [false, 'Already carrying enough food'];
          }

          const { gameState } = context;

          // If already hunting a valid target, continue
          if (human.activeAction === 'attacking' && human.attackTargetId) {
            const currentTarget = gameState.entities.entities.get(human.attackTargetId) as PreyEntity;
            if (
              currentTarget &&
              currentTarget.type === 'prey' &&
              currentTarget.hitpoints > 0 &&
              calculateWrappedDistance(
                human.position,
                currentTarget.position,
                gameState.mapDimensions.width,
                gameState.mapDimensions.height,
              ) <= HUNT_RANGE
            ) {
              blackboard.set(HUNT_TARGET_KEY, currentTarget);
              return [true, 'Continuing hunt'];
            }
          }

          // Find a prey to hunt
          const prey = findClosestEntity<PreyEntity>(
            human,
            gameState,
            'prey',
            HUNT_RANGE,
            (entity) => entity.hitpoints > 0 && (entity.isAdult || false), // Only hunt adult prey
          );

          if (prey) {
            blackboard.set(HUNT_TARGET_KEY, prey);
            return [true, 'Found prey to hunt'];
          }

          blackboard.set(HUNT_TARGET_KEY, undefined);
          return [false, 'No prey in range'];
        },
        'Should Hunt Prey',
        depth + 1,
      ),

      // 2. Action: Hunt the prey
      new ActionNode(
        (human: HumanEntity, context: UpdateContext, blackboard: Blackboard) => {
          const target = blackboard.get<PreyEntity>(HUNT_TARGET_KEY);

          if (!target) {
            return NodeStatus.FAILURE;
          }

          const { gameState } = context;
          const distanceToTarget = calculateWrappedDistance(
            human.position,
            target.position,
            gameState.mapDimensions.width,
            gameState.mapDimensions.height,
          );

          // Check if target is still valid and alive
          if (target.hitpoints <= 0) {
            human.activeAction = 'idle';
            human.attackTargetId = undefined;
            return NodeStatus.SUCCESS; // Target is dead, mission accomplished
          }

          // If too far, move closer
          if (distanceToTarget > HUNT_RANGE) {
            return NodeStatus.FAILURE; // Target out of range
          }

          // Set hunting state
          human.activeAction = 'attacking';
          human.attackTargetId = target.id;
          human.stateMachine = [HUMAN_ATTACKING, { enteredAt: context.gameState.time }];
          
          // The actual hunting/attacking is handled by the interaction system
          return NodeStatus.RUNNING;
        },
        'Hunt Prey',
        depth + 1,
      ),
    ],
    'Human Hunt Prey',
    depth,
  );
}