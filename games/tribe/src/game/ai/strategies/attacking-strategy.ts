import { HumanEntity } from '../../entities/characters/human/human-types';
import { UpdateContext } from '../../world-types';
import { findClosestAggressor, findClosestEntity, areFamily } from '../../utils/world-utils';
import { AI_ATTACK_ENEMY_RANGE, HUMAN_HUNGER_THRESHOLD_CRITICAL, KARMA_ENEMY_THRESHOLD } from '../../world-consts';
import { HumanAIStrategy } from './ai-strategy-types';
import { addVisualEffect } from '../../utils/visual-effects-utils';
import { VisualEffectType } from '../../visual-effects/visual-effect-types';
import { EFFECT_DURATION_SHORT_HOURS } from '../../world-consts';
import { EntityType } from '../../entities/entities-types';

export class AttackingStrategy implements HumanAIStrategy<HumanEntity> {
  check(human: HumanEntity, context: UpdateContext): HumanEntity | null {
    const { gameState } = context;

    if (human.hunger > HUMAN_HUNGER_THRESHOLD_CRITICAL) {
      // If hunger is critical, do not engage in attacks
      return null;
    }

    if (human.attackTargetId) {
      // If already attacking a target, return that target
      const target = gameState.entities.entities.get(human.attackTargetId);
      if (target && target.type === 'human') {
        return target as HumanEntity;
      }
    }

    // --- Child Attack Logic ---
    if (!human.isAdult) {
      // 1. Self-Defense
      const aggressor = findClosestAggressor(human.id, gameState);
      if (aggressor) {
        return aggressor;
      }

      // 2. Family-Defense
      for (const entity of gameState.entities.entities.values()) {
        if (entity.type === 'human') {
          const potentialFamilyMember = entity as HumanEntity;
          if (areFamily(human, potentialFamilyMember, gameState) && potentialFamilyMember.id !== human.id) {
            const familyAggressor = findClosestAggressor(potentialFamilyMember.id, gameState);
            if (familyAggressor) {
              return familyAggressor;
            }
          }
        }
      }

      // Children do not engage in other types of attacks
      return null;
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

    // 0. Vengeance/Enemy Attack
    const enemy = findClosestEntity<HumanEntity>(
      human,
      gameState,
      'human' as EntityType,
      AI_ATTACK_ENEMY_RANGE,
      (entity) => {
        const otherHuman = entity as HumanEntity;
        return (human.karma[otherHuman.id] || 0) < KARMA_ENEMY_THRESHOLD;
      },
    );
    if (enemy) {
      return enemy;
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
