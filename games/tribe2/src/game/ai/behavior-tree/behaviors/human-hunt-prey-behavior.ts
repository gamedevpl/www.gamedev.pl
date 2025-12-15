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
import { MAX_HUNTERS_PER_PREY } from '../../../entities/tribe/tribe-task-utils.ts';
import { EntityId } from '../../../entities/entities-types';
import { TribeRole } from '../../../entities/tribe/tribe-types.ts';
import { isTribeRole } from '../../../entities/tribe/tribe-role-utils.ts';
import { isWithinOperatingRange } from '../../../entities/tribe/territory-utils';
import { createArrow } from '../../../entities/arrow/arrow-utils';
import {
  ARROW_RANGE,
  ARROW_BUILDUP_TIME_HOURS,
  ARROW_COOLDOWN_HOURS,
} from '../../../entities/arrow/arrow-consts';
import { HUMAN_ATTACK_RANGE } from '../../../human-consts';
import { addVisualEffect } from '../../../utils/visual-effects-utils';
import { VisualEffectType } from '../../../visual-effects/visual-effect-types';
import { EFFECT_DURATION_SHORT_HOURS } from '../../../effect-consts';

const HUNT_TARGET_KEY = 'huntTarget';

/**
 * Creates a behavior tree branch for humans hunting prey
 */
export function createHumanHuntPreyBehavior(depth: number): BehaviorNode<HumanEntity> {
  const huntSequence = new Sequence(
    [
      // 1. Find a suitable prey to hunt (cached to avoid frequent searching)
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

            const nearbyPrey = findClosestEntity<PreyEntity>(
              human.position,
              context.gameState,
              'prey',
              AI_HUNTING_FOOD_SEARCH_RADIUS,
              (prey) => {
                // Check if prey is within tribe's operating range (territory + buffer)
                if (human.leaderId && !isWithinOperatingRange(prey.position, human.leaderId, context.gameState)) {
                  return false;
                }
                // We rely on the decorator to check for task capacity later.
                return true;
              },
            );

            if (nearbyPrey) {
              Blackboard.set(blackboard, HUNT_TARGET_KEY, nearbyPrey.id);
              return [true, `Found prey`];
            }

            return [false, 'No suitable prey found'];
          },
          'Find Prey Target',
          depth + 2,
        ),
        BT_HUNTING_PREY_SEARCH_COOLDOWN_HOURS,
        'Cache Find Prey',
        depth + 1,
      ),

      // 2. Action: Hunt the prey (wrapped in TribalTaskDecorator)
      new TribalTaskDecorator(
        new TimeoutNode<HumanEntity>(
          new ActionNode(
            (human: HumanEntity, context: UpdateContext, blackboard: BlackboardData) => {
              if (!human.leaderId) {
                return NodeStatus.FAILURE;
              }

              const targetId = Blackboard.get<number>(blackboard, HUNT_TARGET_KEY);
              if (!targetId) {
                return NodeStatus.FAILURE;
              }

              const target = context.gameState.entities.entities[targetId] as PreyEntity | undefined;
              if (!target || target.hitpoints <= 0) {
                // Target is dead or gone - cleanup and succeed
                Blackboard.delete(blackboard, HUNT_TARGET_KEY);
                human.activeAction = 'idle';
                human.attackTargetId = undefined;
                human.isAimingArrow = false;
                human.arrowBuildupStartTime = undefined;
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
                Blackboard.delete(blackboard, HUNT_TARGET_KEY);
                human.activeAction = 'idle';
                human.attackTargetId = undefined;
                human.isAimingArrow = false;
                human.arrowBuildupStartTime = undefined;
                return NodeStatus.FAILURE;
              }

              // Calculate distance to target
              const distanceToTarget = calculateWrappedDistance(
                human.position,
                target.position,
                gameState.mapDimensions.width,
                gameState.mapDimensions.height,
              );

              // Decrement arrow cooldown if active
              if (human.arrowShootingCooldown !== undefined && human.arrowShootingCooldown > 0) {
                const deltaHours = context.deltaTime / 3600000;
                human.arrowShootingCooldown -= deltaHours;
              }

              // Distance-based attack selection
              if (distanceToTarget > HUMAN_ATTACK_RANGE && distanceToTarget <= ARROW_RANGE) {
                // Arrow range (30-150 pixels) - use ranged attack
                
                // Check if still in arrow cooldown
                if (human.arrowShootingCooldown !== undefined && human.arrowShootingCooldown > 0) {
                  // Continue chasing while on cooldown
                  human.activeAction = 'attacking';
                  human.attackTargetId = target.id;
                  return NodeStatus.RUNNING;
                }

                // Check if currently aiming
                if (human.isAimingArrow) {
                  // Check if buildup is complete
                  if (
                    human.arrowBuildupStartTime !== undefined &&
                    human.arrowBuildupStartTime + ARROW_BUILDUP_TIME_HOURS <= gameState.time
                  ) {
                    // Fire the arrow!
                    createArrow(
                      gameState.entities,
                      human.position,
                      target.position,
                      target.velocity,
                      gameState.mapDimensions,
                      human.id,
                      target.id,
                    );

                    // Set cooldown and reset aiming state
                    human.arrowShootingCooldown = ARROW_COOLDOWN_HOURS;
                    human.isAimingArrow = false;
                    human.arrowBuildupStartTime = undefined;

                    // Add arrow release visual effect
                    addVisualEffect(
                      gameState,
                      VisualEffectType.ArrowRelease,
                      human.position,
                      EFFECT_DURATION_SHORT_HOURS,
                      human.id,
                    );

                    return NodeStatus.RUNNING;
                  } else {
                    // Still building up - continue aiming
                    return NodeStatus.RUNNING;
                  }
                } else {
                  // Start aiming
                  human.isAimingArrow = true;
                  human.arrowBuildupStartTime = gameState.time;
                  human.activeAction = 'attacking';
                  human.attackTargetId = target.id;

                  // Add arrow aiming visual effect
                  addVisualEffect(
                    gameState,
                    VisualEffectType.ArrowAiming,
                    human.position,
                    ARROW_BUILDUP_TIME_HOURS,
                    human.id,
                  );

                  return NodeStatus.RUNNING;
                }
              } else if (distanceToTarget <= HUMAN_ATTACK_RANGE) {
                // Melee range (0-30 pixels) - use melee attack
                // Reset arrow aiming if we get close
                human.isAimingArrow = false;
                human.arrowBuildupStartTime = undefined;

                // Set hunting state
                human.activeAction = 'attacking';
                human.attackTargetId = target.id;

                // The actual melee hunting/attacking is handled by the interaction system
                return NodeStatus.RUNNING;
              } else {
                // Target too far (> arrow range) - chase
                human.isAimingArrow = false;
                human.arrowBuildupStartTime = undefined;
                human.activeAction = 'attacking';
                human.attackTargetId = target.id;
                return NodeStatus.RUNNING;
              }
            },
            'Hunt Prey Action',
            depth + 3,
          ),
          BT_ACTION_TIMEOUT_HOURS, // Use a generous timeout
          'Hunt Prey Timeout',
          depth + 2,
        ),
        {
          taskType: 'hunt',
          maxCapacity: MAX_HUNTERS_PER_PREY,
          getTargetId: (_entity, _context, blackboard) => Blackboard.get<EntityId>(blackboard, HUNT_TARGET_KEY) ?? null,
        },
        'Tribal Hunt Task',
        depth + 1,
      ),
    ],
    'Human Hunt Prey Sequence',
    depth,
  );

  return huntSequence;
}
