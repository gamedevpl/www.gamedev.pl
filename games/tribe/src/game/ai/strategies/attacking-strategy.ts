import { HumanEntity } from '../../entities/characters/human/human-types';
import { UpdateContext } from '../../world-types';
import { findClosestAggressor, findBestAttackTarget } from '../../utils/world-utils';
import {
  AI_ATTACK_ENEMY_RANGE,
  HUMAN_AI_HUNGER_THRESHOLD_FOR_EATING,
  KARMA_ENEMY_THRESHOLD,
  MAX_ATTACKERS_PER_TARGET,
} from '../../world-consts';
import { HumanAIStrategy } from './ai-strategy-types';
import { addVisualEffect } from '../../utils/visual-effects-utils';
import { VisualEffectType } from '../../visual-effects/visual-effect-types';
import { EFFECT_DURATION_SHORT_HOURS } from '../../world-consts';
import { IndexedWorldState } from '../../world-index/world-index-types';
import { calculateWrappedDistance } from '../../utils/math-utils';

export class AttackingStrategy implements HumanAIStrategy<HumanEntity> {
  check(human: HumanEntity, context: UpdateContext): HumanEntity | null {
    const { gameState } = context;

    if (!human.isAdult) {
      // Children do not engage in attacks
      return null;
    }

    if (human.hunger > HUMAN_AI_HUNGER_THRESHOLD_FOR_EATING) {
      // If hunger is critical, do not engage in attacks
      return null;
    }

    if (human.attackTargetId) {
      // If already attacking a target, return that target
      const target = gameState.entities.entities.get(human.attackTargetId);
      if (target && target.type === 'human') {
        const distance = calculateWrappedDistance(
          human.position,
          target?.position,
          gameState.mapDimensions.width,
          gameState.mapDimensions.height,
        );
        if (distance < AI_ATTACK_ENEMY_RANGE) {
          return target as HumanEntity;
        }
      }
    }

    // --- Adult Attack Logic ---

    // 1. Self-Defense
    const aggressor = findClosestAggressor(human.id, gameState);
    if (aggressor) {
      return aggressor;
    }

    // 2. Family-Defense
    for (const entity of gameState.entities.entities.values()) {
      if (entity.type === 'human') {
        const potentialChild = entity as HumanEntity;
        if (potentialChild.motherId === human.id || potentialChild.fatherId === human.id) {
          const childAggressor = findClosestAggressor(potentialChild.id, gameState);
          if (childAggressor) {
            return childAggressor;
          }
        }
      }
    }

    // 3. Vengeance/Enemy Attack
    const enemy = findBestAttackTarget(human, gameState, AI_ATTACK_ENEMY_RANGE, (entity) => {
      const otherHuman = entity as HumanEntity;
      return (human.karma[otherHuman.id] || 0) < KARMA_ENEMY_THRESHOLD;
    });

    if (enemy) {
      const indexedState = gameState as IndexedWorldState;
      const attackers = indexedState.search.human.byProperty('attackTargetId', enemy.id);
      const currentAttackers = attackers.length;

      if (currentAttackers < MAX_ATTACKERS_PER_TARGET) {
        return enemy;
      }
    }

    return null;
  }

  execute(human: HumanEntity, context: UpdateContext, threat: HumanEntity): void {
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
    human.attackTargetId = threat.id;
    human.targetPosition = undefined;
  }
}
