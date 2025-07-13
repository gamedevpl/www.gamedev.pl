import { HumanEntity } from '../../../entities/characters/human/human-types';
import { UpdateContext } from '../../../world-types';
import { Goal, GoalType } from '../goals/goal-types';
import { Action, ActionType } from './action-types';
import { findBestAttackTarget, findClosestAggressor } from '../../../utils/world-utils';
import {
  AI_ATTACK_ENEMY_RANGE,
  AI_FLEE_HEALTH_THRESHOLD,
  HUMAN_AI_HUNGER_THRESHOLD_FOR_ATTACKING,
  KARMA_ENEMY_THRESHOLD,
  MAX_ATTACKERS_PER_TARGET,
  EFFECT_DURATION_SHORT_HOURS,
} from '../../../world-consts';
import { IndexedWorldState } from '../../../world-index/world-index-types';
import { addVisualEffect } from '../../../utils/visual-effects-utils';
import { VisualEffectType } from '../../../visual-effects/visual-effect-types';

// Helper to find the best target for this action
const findTarget = (human: HumanEntity, context: UpdateContext): HumanEntity | null => {
  const { gameState } = context;

  if (
    !human.isAdult ||
    human.hunger > HUMAN_AI_HUNGER_THRESHOLD_FOR_ATTACKING ||
    human.hitpoints < human.maxHitpoints * AI_FLEE_HEALTH_THRESHOLD
  ) {
    return null;
  }

  // 1. Self-Defense: Highest priority
  const aggressor = findClosestAggressor(human.id, gameState);
  if (aggressor) {
    return aggressor;
  }

  // 2. Vengeance/Enemy Attack
  const enemy = findBestAttackTarget(human, gameState, AI_ATTACK_ENEMY_RANGE, (entity) => {
    const otherHuman = entity as HumanEntity;
    return (human.karma[otherHuman.id] || 0) < KARMA_ENEMY_THRESHOLD;
  });

  if (enemy) {
    const indexedState = gameState as IndexedWorldState;
    const attackers = indexedState.search.human.byProperty('attackTargetId', enemy.id);
    if (attackers.length < MAX_ATTACKERS_PER_TARGET) {
      return enemy;
    }
  }

  return null;
};

export const attackHumanAction: Action = {
  type: ActionType.ATTACK_HUMAN,

  getUtility(human: HumanEntity, context: UpdateContext, goal: Goal): number {
    if (
      goal.type !== GoalType.ELIMINATE_THREATS &&
      goal.type !== GoalType.DEFEND_SELF &&
      goal.type !== GoalType.DEFEND_TRIBE
    ) {
      return 0;
    }

    const target = findTarget(human, context);

    if (target) {
      // If the goal is self-defense and we found an aggressor, this is a high-priority action.
      if (goal.type === GoalType.DEFEND_SELF && findClosestAggressor(human.id, context.gameState)?.id === target.id) {
        return 1.0;
      }
      // For other offensive goals, return a high but not maximum utility.
      return 0.8;
    }

    return 0;
  },

  execute(human: HumanEntity, context: UpdateContext): void {
    const target = findTarget(human, context);
    if (!target) {
      // Should not happen if getUtility returned > 0, but as a safeguard.
      human.activeAction = 'idle';
      return;
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
    human.targetPosition = undefined;
  },
};
