import { HumanEntity } from '../../../entities/characters/human/human-types';
import { UpdateContext } from '../../../world-types';
import { ActionNode, ConditionNode, Sequence, TimeoutNode, TribalTaskDecorator } from '../nodes';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { calculateWrappedDistance } from '../../../utils/math-utils';
import { findClosestEntity, getTribeCenter } from '../../../utils';
import { Blackboard, BlackboardData } from '../behavior-tree-blackboard';
import { EntityId } from '../../../entities/entities-types';
import { HUMAN_THROW_RANGE, HUMAN_ATTACK_RANGE } from '../../../human-consts.ts';
import { AI_TRIBE_BATTLE_RADIUS, BT_ACTION_TIMEOUT_HOURS } from '../../../ai-consts.ts';
import { MAX_TRIBE_ATTACKERS_PER_TARGET } from '../../../ai-consts.ts';
import { TribeRole } from '../../../entities/tribe/tribe-types.ts';
import { isTribeRole } from '../../../entities/tribe/tribe-role-utils.ts';

const THROW_COMBAT_TARGET_KEY = 'throwCombatTarget';

/**
 * Creates a behavior tree branch for humans throwing stones at enemy tribe members.
 * Warriors will use ranged attacks against enemies outside melee range.
 */
export function createHumanThrowHumanBehavior(depth: number): BehaviorNode<HumanEntity> {
  return new Sequence(
    [
      // 1. Condition: Find an enemy human to throw at
      new ConditionNode(
        (human: HumanEntity, context: UpdateContext, blackboard) => {
          if (!human.isAdult) {
            return [false, 'Not an adult'];
          }

          if (!human.leaderId) {
            return [false, 'Not in a tribe'];
          }

          // Prefer warriors for ranged combat
          if (!isTribeRole(human, TribeRole.Warrior, context.gameState) && 
              !isTribeRole(human, TribeRole.Hunter, context.gameState)) {
            return [false, 'Not a Warrior or Hunter'];
          }

          // Check if throw is available (not on cooldown)
          if (human.throwCooldown && human.throwCooldown > 0) {
            return [false, 'Throw on cooldown'];
          }

          if (human.hitpoints <= human.maxHitpoints * 0.3) {
            return [false, 'Too injured to attack'];
          }

          const { gameState } = context;

          // Find enemy human that is within throw range but outside melee range
          const enemyHuman = findClosestEntity<HumanEntity>(
            human.position,
            gameState,
            'human',
            HUMAN_THROW_RANGE,
            (target) => {
              // Must be alive
              if (target.hitpoints <= 0) return false;
              
              // Must be adult
              if (!target.isAdult) return false;
              
              // Must be from a different tribe (enemy)
              if (target.leaderId === human.leaderId) return false;
              
              // Must not be the same person
              if (target.id === human.id) return false;

              const distance = calculateWrappedDistance(
                human.position,
                target.position,
                gameState.mapDimensions.width,
                gameState.mapDimensions.height,
              );

              // Prefer ranged attack for enemies outside melee range
              return distance > HUMAN_ATTACK_RANGE * 1.5 && distance <= HUMAN_THROW_RANGE;
            },
          );

          if (enemyHuman) {
            // Check that we're not too far from our tribe center
            const tribeCenter = getTribeCenter(human.leaderId, gameState);
            const distanceFromCenter = calculateWrappedDistance(
              human.position,
              tribeCenter,
              gameState.mapDimensions.width,
              gameState.mapDimensions.height,
            );

            if (distanceFromCenter <= AI_TRIBE_BATTLE_RADIUS * 2) {
              Blackboard.set(blackboard, THROW_COMBAT_TARGET_KEY, enemyHuman.id);
              return [true, 'Found enemy for ranged attack'];
            }
          }

          return [false, 'No enemy human for ranged attack'];
        },
        'Find Enemy Human (Ranged)',
        depth + 1,
      ),

      // 2. Action: Throw stone at enemy (wrapped in TribalTaskDecorator)
      new TribalTaskDecorator(
        new TimeoutNode<HumanEntity>(
          new ActionNode(
            (human: HumanEntity, context: UpdateContext, blackboard: BlackboardData) => {
              const targetId = Blackboard.get<EntityId>(blackboard, THROW_COMBAT_TARGET_KEY);
              if (!targetId) {
                return NodeStatus.FAILURE;
              }

              const target = context.gameState.entities.entities[targetId] as HumanEntity | undefined;
              if (!target || target.hitpoints <= 0) {
                // Target is dead or gone - cleanup and succeed
                Blackboard.delete(blackboard, THROW_COMBAT_TARGET_KEY);
                human.activeAction = 'idle';
                human.throwTargetId = undefined;
                return NodeStatus.SUCCESS;
              }

              const { gameState } = context;

              // Check if human should flee
              if (human.hitpoints < human.maxHitpoints * 0.3) {
                Blackboard.delete(blackboard, THROW_COMBAT_TARGET_KEY);
                human.activeAction = 'idle';
                human.throwTargetId = undefined;
                return NodeStatus.FAILURE; // Too injured to fight
              }

              // Check if throw just went on cooldown (means we successfully threw)
              if (human.throwCooldown && human.throwCooldown > 0) {
                Blackboard.delete(blackboard, THROW_COMBAT_TARGET_KEY);
                human.activeAction = 'idle';
                human.throwTargetId = undefined;
                return NodeStatus.SUCCESS; // Successfully threw
              }

              const distanceToTarget = calculateWrappedDistance(
                human.position,
                target.position,
                gameState.mapDimensions.width,
                gameState.mapDimensions.height,
              );

              // If target moved out of throw range, fail
              if (distanceToTarget > HUMAN_THROW_RANGE * 1.2) {
                Blackboard.delete(blackboard, THROW_COMBAT_TARGET_KEY);
                human.activeAction = 'idle';
                human.throwTargetId = undefined;
                return NodeStatus.FAILURE;
              }

              // Set throwing state
              human.activeAction = 'throwing';
              human.throwTargetId = target.id;

              // The actual throwing is handled by the interaction system
              return NodeStatus.RUNNING;
            },
            'Throw at Enemy Human',
            depth + 3,
          ),
          BT_ACTION_TIMEOUT_HOURS,
          'Throw Combat Timeout',
          depth + 2,
        ),
        {
          taskType: 'hunt',
          maxCapacity: MAX_TRIBE_ATTACKERS_PER_TARGET,
          getTargetId: (_entity, _context, blackboard) =>
            Blackboard.get<EntityId>(blackboard, THROW_COMBAT_TARGET_KEY) ?? null,
        },
        'Tribal Throw Combat Task',
        depth + 1,
      ),
    ],
    'Human Throw at Enemy Human',
    depth,
  );
}
