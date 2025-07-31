import { HumanEntity } from '../../../entities/characters/human/human-types';
import { findNearbyEnemiesOfTribe, countTribeAttackersOnTarget, getTribeCenter } from '../../../utils/world-utils';
import {
  AI_FLEE_HEALTH_THRESHOLD,
  AI_TRIBE_BATTLE_RADIUS,
  ATTACK_CHASE_MAX_DISTANCE_FROM_CENTER,
  EFFECT_DURATION_SHORT_HOURS,
  HUMAN_AI_HUNGER_THRESHOLD_FOR_ATTACKING,
  MAX_TRIBE_ATTACKERS_PER_TARGET,
} from '../../../world-consts';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { ActionNode, ConditionNode, Sequence } from '../nodes';
import { IndexedWorldState } from '../../../world-index/world-index-types';
import { calculateWrappedDistance } from '../../../utils/math-utils';
import { addVisualEffect } from '../../../utils/visual-effects-utils';
import { VisualEffectType } from '../../../visual-effects/visual-effect-types';
import { Vector2D } from '../../../utils/math-types';

const COMBAT_TARGET_KEY = 'combatTarget';
const HOME_CENTER_KEY = 'homeCenter';

/**
 * Creates a behavior for a tribe member to join a battle when the leader calls,
 * but without chasing enemies too far from the tribe's center.
 */
export function createTribeMemberCombatBehavior(depth: number): BehaviorNode<HumanEntity> {
  const isTribeFollower = new ConditionNode<HumanEntity>(
    (human) => (human.isAdult && human.leaderId ? human.id !== human.leaderId : false),
    'Is Tribe Follower?',
    depth + 1,
  );

  const isFitForCombat = new ConditionNode<HumanEntity>(
    (human) =>
      human.hunger < HUMAN_AI_HUNGER_THRESHOLD_FOR_ATTACKING &&
      human.hitpoints >= human.maxHitpoints * AI_FLEE_HEALTH_THRESHOLD,
    'Is Fit for Combat?',
    depth + 1,
  );

  const isLeaderCallingToAttack = new ConditionNode<HumanEntity>(
    (human, context) => {
      const leader = context.gameState.entities.entities.get(human.leaderId as number) as HumanEntity | undefined;
      return !!leader?.isCallingToAttack;
    },
    'Is Leader Calling to Attack?',
    depth + 1,
  );

  const findBestTarget = new ActionNode<HumanEntity>(
    (human, context, blackboard) => {
      const { gameState } = context;
      const leader = gameState.entities.entities.get(human.leaderId as number) as HumanEntity | undefined;
      if (!leader) {
        return NodeStatus.FAILURE;
      }

      const enemies = findNearbyEnemiesOfTribe(leader, gameState as IndexedWorldState, AI_TRIBE_BATTLE_RADIUS);

      if (enemies.length === 0) {
        return NodeStatus.FAILURE;
      }

      enemies.sort((a, b) => {
        const distA = calculateWrappedDistance(
          human.position,
          a.position,
          gameState.mapDimensions.width,
          gameState.mapDimensions.height,
        );
        const distB = calculateWrappedDistance(
          human.position,
          b.position,
          gameState.mapDimensions.width,
          gameState.mapDimensions.height,
        );
        return distA - distB;
      });

      for (const enemy of enemies) {
        const attackersCount = countTribeAttackersOnTarget(leader.id, enemy.id, gameState as IndexedWorldState);
        if (attackersCount < MAX_TRIBE_ATTACKERS_PER_TARGET) {
          blackboard.set(COMBAT_TARGET_KEY, enemy);
          const homeCenter = getTribeCenter(leader.id, gameState);
          blackboard.set(HOME_CENTER_KEY, homeCenter);
          return NodeStatus.SUCCESS;
        }
      }

      return NodeStatus.FAILURE;
    },
    'Find Best Target',
    depth + 1,
  );

  const attackTarget = new ActionNode<HumanEntity>(
    (human, context, blackboard) => {
      const target = blackboard.get(COMBAT_TARGET_KEY) as HumanEntity | undefined;
      const homeCenter = blackboard.get(HOME_CENTER_KEY) as Vector2D | undefined;

      if (!target || !homeCenter) {
        return NodeStatus.FAILURE;
      }

      const { gameState } = context;
      const distanceFromHome = calculateWrappedDistance(
        human.position,
        homeCenter,
        gameState.mapDimensions.width,
        gameState.mapDimensions.height,
      );

      if (distanceFromHome > ATTACK_CHASE_MAX_DISTANCE_FROM_CENTER) {
        // Give up the chase
        if (human.activeAction === 'attacking' && human.attackTargetId === target.id) {
          human.activeAction = 'idle';
          human.attackTargetId = undefined;
        }
        blackboard.set(COMBAT_TARGET_KEY, undefined);
        blackboard.set(HOME_CENTER_KEY, undefined);
        return NodeStatus.FAILURE;
      }

      if (
        !human.lastTargetAcquiredEffectTime ||
        context.gameState.time - human.lastTargetAcquiredEffectTime > EFFECT_DURATION_SHORT_HOURS * 5
      ) {
        addVisualEffect(
          context.gameState,
          VisualEffectType.TargetAcquired,
          human.position,
          EFFECT_DURATION_SHORT_HOURS,
          human.id,
        );
        human.lastTargetAcquiredEffectTime = context.gameState.time;
      }

      human.activeAction = 'attacking';
      human.attackTargetId = target.id;
      human.target = undefined;

      return NodeStatus.RUNNING;
    },
    'Attack Target',
    depth + 1,
  );

  return new Sequence(
    [isTribeFollower, isFitForCombat, isLeaderCallingToAttack, findBestTarget, attackTarget],
    'Tribe Member Combat',
    depth,
  );
}
