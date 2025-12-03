import { HumanEntity } from '../../../entities/characters/human/human-types';
import { UpdateContext } from '../../../world-types';
import { ActionNode, ConditionNode, Sequence } from '../nodes';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { Blackboard, BlackboardData } from '../behavior-tree-blackboard';
import { ATTACK_CHASE_MAX_DISTANCE_FROM_CENTER } from '../../../ai-consts.ts';
import { calculateWrappedDistance } from '../../../utils/math-utils';
import { findClosestEntity, getFamilyCenter, getFamilyMembers, getTribeCenter, isHostile } from '../../../utils';
import { Vector2D } from '../../../utils/math-types';
import { EntityId } from '../../../entities/entities-types.ts';

const ATTACK_TARGET_KEY = 'attackTarget';
const HOME_CENTER_KEY = 'homeCenter';
const ATTACK_RANGE = 150; // The maximum distance to initiate an attack

/**
 * Creates a behavior tree branch for attacking enemies, but with a leash to home territory.
 * The behavior is a sequence that finds a target, checks distance from home, and then executes the attack.
 */
export function createAttackingBehavior(depth: number): BehaviorNode<HumanEntity> {
  return new Sequence(
    [
      // 1. Condition: Is there a valid enemy to attack?
      new ConditionNode(
        (human: HumanEntity, context: UpdateContext, blackboard: BlackboardData) => {
          if (!human.isAdult) {
            return [false, 'Not an adult'];
          }

          // If already attacking a valid target, continue with that target.
          const { gameState } = context;
          if (human.activeAction === 'attacking' && human.attackTargetId) {
            const currentTarget = gameState.entities.entities[human.attackTargetId] as HumanEntity;
            if (
              currentTarget &&
              currentTarget.hitpoints > 0 &&
              calculateWrappedDistance(
                human.position,
                currentTarget.position,
                gameState.mapDimensions.width,
                gameState.mapDimensions.height,
              ) <= ATTACK_RANGE
            ) {
              Blackboard.set(blackboard, ATTACK_TARGET_KEY, currentTarget.id);
              // Ensure home center is set
              if (!Blackboard.get(blackboard, HOME_CENTER_KEY)) {
                const homeCenter = human.leaderId
                  ? getTribeCenter(human.leaderId, gameState)
                  : getFamilyMembers(human, gameState).length > 0
                  ? getFamilyCenter(human, gameState)
                  : human.position;
                Blackboard.set(blackboard, HOME_CENTER_KEY, homeCenter);
              }
              return true;
            }
          }

          // Find a new target if not currently engaged.
          const enemy = findClosestEntity<HumanEntity>(
            human,
            gameState,
            'human',
            ATTACK_RANGE,
            (entity) => entity.hitpoints > 0 && isHostile(human, entity, gameState),
          );
          if (enemy) {
            Blackboard.set(blackboard, ATTACK_TARGET_KEY, enemy.id);
            const homeCenter = human.leaderId
              ? getTribeCenter(human.leaderId, gameState)
              : getFamilyMembers(human, gameState).length > 0
              ? getFamilyCenter(human, gameState)
              : human.position;
            Blackboard.set(blackboard, HOME_CENTER_KEY, homeCenter);
            return true;
          }

          // No target found.
          Blackboard.set(blackboard, ATTACK_TARGET_KEY, undefined);
          Blackboard.set(blackboard, HOME_CENTER_KEY, undefined);
          return false;
        },
        'Find Attack Target',
        depth + 1,
      ),
      // 2. Action: Execute the attack, ensuring not too far from home.
      new ActionNode(
        (human: HumanEntity, context: UpdateContext, blackboard: BlackboardData) => {
          const targetId = Blackboard.get<EntityId>(blackboard, ATTACK_TARGET_KEY);
          const target = targetId && (context.gameState.entities.entities[targetId] as HumanEntity | undefined);
          const homeCenter = Blackboard.get<Vector2D>(blackboard, HOME_CENTER_KEY);

          if (!target || !homeCenter) {
            return NodeStatus.FAILURE; // Should not happen if condition passed
          }

          const { gameState } = context;
          const distanceFromHome = calculateWrappedDistance(
            human.position,
            homeCenter,
            gameState.mapDimensions.width,
            gameState.mapDimensions.height,
          );

          // Give up the chase if too far from home
          if (distanceFromHome > ATTACK_CHASE_MAX_DISTANCE_FROM_CENTER) {
            human.activeAction = 'idle';
            human.attackTargetId = undefined;
            Blackboard.set(blackboard, ATTACK_TARGET_KEY, undefined);
            Blackboard.set(blackboard, HOME_CENTER_KEY, undefined);
            return NodeStatus.FAILURE;
          }

          // If target is invalid (dead, gone, or out of range), the threat is gone.
          if (
            target.hitpoints <= 0 ||
            calculateWrappedDistance(
              human.position,
              target.position,
              gameState.mapDimensions.width,
              gameState.mapDimensions.height,
            ) > ATTACK_RANGE
          ) {
            if (human.activeAction === 'attacking') {
              human.activeAction = 'idle';
              human.attackTargetId = undefined;
            }
            Blackboard.set(blackboard, ATTACK_TARGET_KEY, undefined);
            Blackboard.set(blackboard, HOME_CENTER_KEY, undefined);
            return NodeStatus.SUCCESS;
          }

          // If already attacking this target, continue running.
          if (human.activeAction === 'attacking' && human.attackTargetId === target.id) {
            return NodeStatus.RUNNING;
          }

          // Initiate the attack state.
          human.activeAction = 'attacking';
          human.attackTargetId = target.id;
          return NodeStatus.RUNNING;
        },
        'Execute Attack',
        depth + 1,
      ),
    ],
    'Attack',
    depth,
  );
}
