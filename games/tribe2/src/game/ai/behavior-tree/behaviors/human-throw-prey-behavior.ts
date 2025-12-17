import { HumanEntity } from '../../../entities/characters/human/human-types';
import { PreyEntity } from '../../../entities/characters/prey/prey-types';
import { UpdateContext } from '../../../world-types';
import { ActionNode, CachingNode, ConditionNode, Sequence, TimeoutNode, TribalTaskDecorator } from '../nodes';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { Blackboard, BlackboardData } from '../behavior-tree-blackboard';
import { calculateWrappedDistance } from '../../../utils/math-utils';
import { getTribeCenter, findClosestEntity } from '../../../utils';
import {
  AI_HUNTING_FOOD_SEARCH_RADIUS,
  AI_HUNTING_MAX_CHASE_DISTANCE_FROM_CENTER,
  BT_ACTION_TIMEOUT_HOURS,
  BT_HUNTING_PREY_SEARCH_COOLDOWN_HOURS,
} from '../../../ai-consts.ts';
import { HUMAN_THROW_RANGE, HUMAN_ATTACK_RANGE } from '../../../human-consts.ts';
import { MAX_HUNTERS_PER_PREY } from '../../../entities/tribe/tribe-task-utils.ts';
import { EntityId } from '../../../entities/entities-types';
import { TribeRole } from '../../../entities/tribe/tribe-types.ts';
import { isTribeRole } from '../../../entities/tribe/tribe-role-utils.ts';
import { isWithinOperatingRange } from '../../../entities/tribe/territory-utils';

const THROW_HUNT_TARGET_KEY = 'throwHuntTarget';

/**
 * Creates a behavior tree branch for humans throwing stones at prey (ranged hunting).
 * This is preferred when:
 * - The human has throw available (cooldown expired)
 * - The prey is at medium range (outside melee range but within throw range)
 * - Helps hunters take down prey before it can flee
 */
export function createHumanThrowPreyBehavior(depth: number): BehaviorNode<HumanEntity> {
  const throwHuntSequence = new Sequence(
    [
      // 1. Find a suitable prey to throw at (cached to avoid frequent searching)
      new CachingNode(
        new ConditionNode(
          (human: HumanEntity, context: UpdateContext, blackboard) => {
            if (!human.isAdult) {
              return [false, 'Not an adult'];
            }

            if (!human.leaderId) {
              return [false, 'Not in a tribe'];
            }

            if (!isTribeRole(human, TribeRole.Hunter, context.gameState)) {
              return [false, 'Not a Hunter'];
            }

            // Check if throw is available (not on cooldown)
            if (human.throwCooldown && human.throwCooldown > 0) {
              return [false, 'Throw on cooldown'];
            }

            // Find prey that is within throw range but outside melee range
            // This makes ranged attack preferable for distant targets
            const nearbyPrey = findClosestEntity<PreyEntity>(
              human.position,
              context.gameState,
              'prey',
              AI_HUNTING_FOOD_SEARCH_RADIUS,
              (prey) => {
                // Check if prey is within tribe's operating range
                if (human.leaderId && !isWithinOperatingRange(prey.position, human.leaderId, context.gameState)) {
                  return false;
                }

                const distance = calculateWrappedDistance(
                  human.position,
                  prey.position,
                  context.gameState.mapDimensions.width,
                  context.gameState.mapDimensions.height,
                );

                // Prefer ranged attack for prey that is further away but within throw range
                // This helps land the first hit before prey flees
                return distance > HUMAN_ATTACK_RANGE * 1.5 && distance <= HUMAN_THROW_RANGE * 1.2;
              },
            );

            if (nearbyPrey) {
              Blackboard.set(blackboard, THROW_HUNT_TARGET_KEY, nearbyPrey.id);
              return [true, `Found prey for ranged attack`];
            }

            return [false, 'No suitable prey for ranged attack'];
          },
          'Find Prey Target (Ranged)',
          depth + 2,
        ),
        BT_HUNTING_PREY_SEARCH_COOLDOWN_HOURS,
        'Cache Find Prey (Ranged)',
        depth + 1,
      ),

      // 2. Action: Throw stone at prey (wrapped in TribalTaskDecorator)
      new TribalTaskDecorator(
        new TimeoutNode<HumanEntity>(
          new ActionNode(
            (human: HumanEntity, context: UpdateContext, blackboard: BlackboardData) => {
              if (!human.leaderId) {
                return NodeStatus.FAILURE;
              }

              const targetId = Blackboard.get<number>(blackboard, THROW_HUNT_TARGET_KEY);
              if (!targetId) {
                return NodeStatus.FAILURE;
              }

              const target = context.gameState.entities.entities[targetId] as PreyEntity | undefined;
              if (!target || target.hitpoints <= 0) {
                // Target is dead or gone - cleanup and succeed
                Blackboard.delete(blackboard, THROW_HUNT_TARGET_KEY);
                human.activeAction = 'idle';
                human.throwTargetId = undefined;
                return NodeStatus.SUCCESS;
              }

              const { gameState } = context;
              const tribeCenter = getTribeCenter(human.leaderId, gameState);
              const distanceFromCenter = calculateWrappedDistance(
                human.position,
                tribeCenter,
                gameState.mapDimensions.width,
                gameState.mapDimensions.height,
              );

              // Fail if chasing too far from home
              if (distanceFromCenter > AI_HUNTING_MAX_CHASE_DISTANCE_FROM_CENTER) {
                Blackboard.delete(blackboard, THROW_HUNT_TARGET_KEY);
                human.activeAction = 'idle';
                human.throwTargetId = undefined;
                return NodeStatus.FAILURE;
              }

              // Check if throw just went on cooldown (means we successfully threw)
              if (human.throwCooldown && human.throwCooldown > 0) {
                // We threw - clear target and succeed
                Blackboard.delete(blackboard, THROW_HUNT_TARGET_KEY);
                human.activeAction = 'idle';
                human.throwTargetId = undefined;
                return NodeStatus.SUCCESS;
              }

              // Set throwing state
              human.activeAction = 'throwing';
              human.throwTargetId = target.id;

              // The actual throwing is handled by the interaction system
              return NodeStatus.RUNNING;
            },
            'Throw at Prey Action',
            depth + 3,
          ),
          BT_ACTION_TIMEOUT_HOURS, // Use a generous timeout
          'Throw at Prey Timeout',
          depth + 2,
        ),
        {
          taskType: 'hunt',
          maxCapacity: MAX_HUNTERS_PER_PREY,
          getTargetId: (_entity, _context, blackboard) =>
            Blackboard.get<EntityId>(blackboard, THROW_HUNT_TARGET_KEY) ?? null,
        },
        'Tribal Throw Hunt Task',
        depth + 1,
      ),
    ],
    'Human Throw at Prey Sequence',
    depth,
  );

  return throwHuntSequence;
}
