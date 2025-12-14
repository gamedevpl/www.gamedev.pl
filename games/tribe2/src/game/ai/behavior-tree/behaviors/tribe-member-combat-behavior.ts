import { HumanEntity } from '../../../entities/characters/human/human-types';
import { findNearbyEnemiesOfTribe, countTribeAttackersOnTarget, getTribeCenter } from '../../../utils/world-utils';
import {
  AI_FLEE_HEALTH_THRESHOLD,
  AI_TRIBE_BATTLE_RADIUS,
  ATTACK_CHASE_MAX_DISTANCE_FROM_CENTER,
  HUMAN_AI_HUNGER_THRESHOLD_FOR_ATTACKING,
  MAX_TRIBE_ATTACKERS_PER_TARGET,
} from '../../../ai-consts.ts';
import { EFFECT_DURATION_SHORT_HOURS } from '../../../effect-consts.ts';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { ActionNode, ConditionNode, Sequence } from '../nodes';
import { IndexedWorldState } from '../../../world-index/world-index-types';
import { calculateWrappedDistance } from '../../../utils/math-utils';
import { addVisualEffect } from '../../../utils/visual-effects-utils';
import { VisualEffectType } from '../../../visual-effects/visual-effect-types';
import { Vector2D } from '../../../utils/math-types';
import { Blackboard } from '../behavior-tree-blackboard.ts';
import { EntityId } from '../../../entities/entities-types.ts';
import { registerDemand } from '../../../entities/tribe/logistics-utils.ts';
import { getTribeLeaderForCoordination } from '../../../entities/tribe/tribe-task-utils.ts';
import { HUMAN_HUNGER_DEATH } from '../../../human-consts.ts';

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
    (human, context) => {
      const isHungry = human.hunger >= HUMAN_AI_HUNGER_THRESHOLD_FOR_ATTACKING;
      
      // If warrior is too hungry, register a demand for food delivery
      if (isHungry) {
        const leader = getTribeLeaderForCoordination(human, context.gameState);
        if (leader?.aiBlackboard) {
          // Priority based on hunger level relative to death threshold
          const hungerRatio = human.hunger / HUMAN_HUNGER_DEATH;
          const priority = hungerRatio > 0.8 ? 5 : hungerRatio > 0.67 ? 4 : 3;
          registerDemand(leader.aiBlackboard, human.id, priority, human.position, context.gameState.time);
        }
      }
      
      return !isHungry && human.hitpoints >= human.maxHitpoints * AI_FLEE_HEALTH_THRESHOLD;
    },
    'Is Fit for Combat?',
    depth + 1,
  );

  const findBestTarget = new ActionNode<HumanEntity>(
    (human, context, blackboard) => {
      const { gameState } = context;
      const leader = gameState.entities.entities[human.leaderId as number] as HumanEntity | undefined;
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
          Blackboard.set(blackboard, COMBAT_TARGET_KEY, enemy.id);
          const homeCenter = getTribeCenter(leader.id, gameState);
          Blackboard.set(blackboard, HOME_CENTER_KEY, homeCenter);
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
      const targetId = Blackboard.get<EntityId>(blackboard, COMBAT_TARGET_KEY);
      const target = targetId && (context.gameState.entities.entities[targetId] as HumanEntity | undefined);
      const homeCenter = Blackboard.get(blackboard, HOME_CENTER_KEY) as Vector2D | undefined;

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
        Blackboard.set(blackboard, COMBAT_TARGET_KEY, undefined);
        Blackboard.set(blackboard, HOME_CENTER_KEY, undefined);
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

  return new Sequence([isTribeFollower, isFitForCombat, findBestTarget, attackTarget], 'Tribe Member Combat', depth);
}
