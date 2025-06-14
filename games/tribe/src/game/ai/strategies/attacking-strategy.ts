import { HumanEntity } from '../../entities/characters/human/human-types';
import { UpdateContext } from '../../world-types';
import { findAggressor, findClosestEntity, findProcreationThreat } from '../../utils/world-utils';
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

export class AttackingStrategy implements HumanAIStrategy {
  private _threat: HumanEntity | null = null;

  check(human: HumanEntity, context: UpdateContext): boolean {
    this._threat = null;
    const { gameState } = context;
    const allEntities = gameState.entities.entities;
    const { mapDimensions } = gameState;

    // 1. Self-Defense
    let aggressor = findAggressor(human.id, allEntities);
    if (aggressor) {
      this._threat = aggressor;
      return true;
    }

    // 2. Family-Defense
    for (const entity of allEntities.values()) {
      if (entity.type === 'human') {
        const potentialChild = entity as HumanEntity;
        if (potentialChild.motherId === human.id || potentialChild.fatherId === human.id) {
          aggressor = findAggressor(potentialChild.id, allEntities);
          if (aggressor) {
            this._threat = aggressor;
            return true;
          }
        }
      }
    }

    // 3. Procreation-Defense
    const procreationThreat = findProcreationThreat(human, allEntities, mapDimensions.width, mapDimensions.height);
    if (procreationThreat) {
      this._threat = procreationThreat;
      return true;
    }

    // 4. Resource-Defense
    const intruder = findClosestEntity<HumanEntity>(
      human,
      allEntities,
      'human' as EntityType,
      gameState.mapDimensions.width,
      gameState.mapDimensions.height,
      AI_DEFEND_CLAIMED_BUSH_RANGE,
      (entity) => {
        const otherHuman = entity as HumanEntity;
        if (otherHuman.activeAction !== 'gathering') return false;

        const targetBush = findClosestEntity<BerryBushEntity>(
          otherHuman,
          allEntities,
          'berryBush' as EntityType,
          gameState.mapDimensions.width,
          gameState.mapDimensions.height,
          HUMAN_ATTACK_RANGE,
        );

        return !!targetBush && targetBush.ownerId === human.id;
      },
    );

    if (intruder) {
      this._threat = intruder;
      return true;
    }

    // 5. Hunger-Driven Attack
    if (human.hunger > AI_ATTACK_HUNGER_THRESHOLD) {
      const target = findClosestEntity<HumanEntity>(
        human,
        allEntities,
        'human' as EntityType,
        gameState.mapDimensions.width,
        gameState.mapDimensions.height,
        undefined, // No max range
        (entity) => {
          const otherHuman = entity as HumanEntity;
          return (
            otherHuman.id !== human.id &&
            otherHuman.berries >= AI_ATTACK_TARGET_MIN_BERRY_COUNT &&
            otherHuman.motherId !== human.id &&
            otherHuman.fatherId !== human.id
          );
        },
      );
      if (target) {
        this._threat = target;
        return true;
      }
    }

    return false;
  }

  execute(human: HumanEntity, context: UpdateContext): void {
    if (
      this._threat &&
      (!human.lastTargetAcquiredEffectTime ||
        context.gameState.time - human.lastTargetAcquiredEffectTime > EFFECT_DURATION_SHORT_HOURS * 5)
    ) {
      addVisualEffect(context.gameState, VisualEffectType.TargetAcquired, human.position, EFFECT_DURATION_SHORT_HOURS, human.id);
      human.lastTargetAcquiredEffectTime = context.gameState.time;
    }
    if (!this._threat) {
      return;
    }

    const distance = vectorDistance(human.position, this._threat.position);

    if (distance > HUMAN_ATTACK_RANGE) {
      human.activeAction = 'moving';
      human.targetPosition = { ...this._threat.position };
      const dirToTarget = vectorSubtract(this._threat.position, human.position);
      human.direction = vectorNormalize(dirToTarget);
    } else {
      human.activeAction = 'attacking';
      human.attackTargetId = this._threat.id;
      human.targetPosition = undefined;
      human.direction = { x: 0, y: 0 };
    }
  }
}
