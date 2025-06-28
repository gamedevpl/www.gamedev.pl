import { HumanEntity } from '../../entities/characters/human/human-types';
import { UpdateContext } from '../../world-types';
import { findClosestAggressor, findBestAttackTarget } from '../../utils/world-utils';
import {
  AI_ATTACK_ENEMY_RANGE,
  AI_FLEE_HEALTH_THRESHOLD,
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
import { Entity } from '../../entities/entities-types';

export class AttackingStrategy implements HumanAIStrategy<Entity> {
  check(human: HumanEntity, context: UpdateContext): Entity | null {
    const { gameState } = context;

    if (!human.isAdult) {
      return null;
    }

    if (human.hunger > HUMAN_AI_HUNGER_THRESHOLD_FOR_EATING) {
      return null;
    }

    if (human.hitpoints < human.maxHitpoints * AI_FLEE_HEALTH_THRESHOLD) {
      return null;
    }

    if (human.attackTargetId) {
      const target = gameState.entities.entities.get(human.attackTargetId);
      if (target) {
        const distance = calculateWrappedDistance(
          human.position,
          target.position,
          gameState.mapDimensions.width,
          gameState.mapDimensions.height,
        );
        if (distance < AI_ATTACK_ENEMY_RANGE) {
          return target;
        }
      }
    }

    // 2. Self-Defense
    const aggressor = findClosestAggressor(human.id, gameState);
    if (aggressor) {
      return aggressor;
    }

    // 3. Family-Defense
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

    // 4. Vengeance/Enemy Attack
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

  execute(human: HumanEntity, context: UpdateContext, threat: Entity): void {
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
