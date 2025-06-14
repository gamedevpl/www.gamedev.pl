import { HumanEntity } from '../../entities/characters/human/human-types';
import { UpdateContext } from '../../world-types';
import { findAggressor, findClosestEntity, findProcreationThreat, areFamily } from '../../utils/world-utils';
import {
  AI_ATTACK_HUNGER_THRESHOLD,
  AI_ATTACK_TARGET_MIN_BERRY_COUNT,
  AI_DEFEND_CLAIMED_BUSH_RANGE,
  HUMAN_ATTACK_RANGE,
} from '../../world-consts';
import { HumanAIStrategy } from './ai-strategy-types';
import { addVisualEffect } from '../../utils/visual-effects-utils';
import { VisualEffectType } from '../../visual-effects/visual-effect-types';
import { EFFECT_DURATION_SHORT_HOURS } from '../../world-consts';
import { vectorDistance, vectorNormalize, vectorSubtract } from '../../utils/math-utils';
import { EntityType } from '../../entities/entities-types';
import { BerryBushEntity } from '../../entities/plants/berry-bush/berry-bush-types';

export class AttackingStrategy implements HumanAIStrategy<HumanEntity> {
  check(human: HumanEntity, context: UpdateContext): HumanEntity | null {
    const { gameState } = context;

    // 1. Self-Defense
    const aggressor = findAggressor(human.id, gameState);
    if (aggressor) {
      return aggressor;
    }

    // 2. Family-Defense
    for (const entity of gameState.entities.entities.values()) {
      if (entity.type === 'human') {
        const potentialChild = entity as HumanEntity;
        if (potentialChild.motherId === human.id || potentialChild.fatherId === human.id) {
          const childAggressor = findAggressor(potentialChild.id, gameState);
          if (childAggressor) {
            return childAggressor;
          }
        }
      }
    }

    // 3. Procreation-Defense
    const procreationThreat = findProcreationThreat(human, gameState);
    if (procreationThreat) {
      return procreationThreat;
    }

    // 4. Resource-Defense
    const intruder = findClosestEntity<HumanEntity>(
      human,
      gameState,
      'human' as EntityType,
      AI_DEFEND_CLAIMED_BUSH_RANGE,
      (entity) => {
        const otherHuman = entity as HumanEntity;
        if (otherHuman.activeAction !== 'gathering') return false;

        if (areFamily(human, otherHuman, gameState)) {
          return false;
        }

        const targetBush = findClosestEntity<BerryBushEntity>(
          otherHuman,
          gameState,
          'berryBush' as EntityType,
          HUMAN_ATTACK_RANGE,
        );

        return !!targetBush && targetBush.ownerId === human.id;
      },
    );

    if (intruder) {
      return intruder;
    }

    // 5. Hunger-Driven Attack
    if (human.hunger > AI_ATTACK_HUNGER_THRESHOLD) {
      const target = findClosestEntity<HumanEntity>(
        human,
        gameState,
        'human' as EntityType,
        undefined, // No max range
        (entity) => {
          const otherHuman = entity as HumanEntity;
          if (areFamily(human, otherHuman, gameState)) {
            return false;
          }
          return otherHuman.berries >= AI_ATTACK_TARGET_MIN_BERRY_COUNT;
        },
      );
      if (target) {
        return target;
      }
    }

    return null;
  }

  execute(human: HumanEntity, context: UpdateContext, threat: HumanEntity): void {
    if (
      !human.lastTargetAcquiredEffectTime ||
      context.gameState.time - human.lastTargetAcquiredEffectTime > EFFECT_DURATION_SHORT_HOURS * 5
    ) {
      addVisualEffect(context.gameState, VisualEffectType.TargetAcquired, human.position, EFFECT_DURATION_SHORT_HOURS, human.id);
      human.lastTargetAcquiredEffectTime = context.gameState.time;
    }

    const distance = vectorDistance(human.position, threat.position);

    if (distance > HUMAN_ATTACK_RANGE) {
      human.activeAction = 'moving';
      human.targetPosition = { ...threat.position };
      const dirToTarget = vectorSubtract(threat.position, human.position);
      human.direction = vectorNormalize(dirToTarget);
    } else {
      human.activeAction = 'attacking';
      human.attackTargetId = threat.id;
      human.targetPosition = undefined;
      human.direction = { x: 0, y: 0 };
    }
  }
}
