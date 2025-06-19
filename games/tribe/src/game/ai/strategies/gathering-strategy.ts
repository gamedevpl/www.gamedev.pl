import { HumanEntity } from '../../entities/characters/human/human-types';
import { UpdateContext } from '../../world-types';
import { BerryBushEntity } from '../../entities/plants/berry-bush/berry-bush-types';
import { vectorDistance, vectorNormalize, getDirectionVectorOnTorus } from '../../utils/math-utils';
import { findClosestEntity } from '../../utils/world-utils';
import {
  HUMAN_AI_HUNGER_THRESHOLD_FOR_GATHERING,
  HUMAN_INTERACTION_RANGE,
} from '../../world-consts';
import { EntityType } from '../../entities/entities-types';
import { HumanAIStrategy } from './ai-strategy-types';
import { HumanCorpseEntity } from '../../entities/characters/human/human-corpse-types';

type FoodSource = BerryBushEntity | HumanCorpseEntity;

export class GatheringStrategy implements HumanAIStrategy<FoodSource> {
  check(human: HumanEntity, context: UpdateContext): FoodSource | null {
    const hasCapacity = human.food.length < human.maxFood;
    if (!human.isAdult || !hasCapacity || human.hunger < HUMAN_AI_HUNGER_THRESHOLD_FOR_GATHERING) {
      return null;
    }

    const { gameState } = context;

    const closestBush = findClosestEntity<BerryBushEntity>(
      human,
      gameState,
      'berryBush' as EntityType,
      undefined,
      (b) => b.food.length > 0,
    );

    const closestCorpse = findClosestEntity<HumanCorpseEntity>(
      human,
      gameState,
      'humanCorpse' as EntityType,
      undefined,
      (c) => c.food.length > 0,
    );

    if (closestBush && closestCorpse) {
      const distToBush = vectorDistance(human.position, closestBush.position);
      const distToCorpse = vectorDistance(human.position, closestCorpse.position);
      return distToBush <= distToCorpse ? closestBush : closestCorpse;
    }

    return closestBush || closestCorpse;
  }

  execute(human: HumanEntity, context: UpdateContext, target: FoodSource): void {
    if (!target) {
      human.activeAction = 'idle';
      human.direction = { x: 0, y: 0 };
      human.targetPosition = undefined;
      return;
    }

    const distance = vectorDistance(human.position, target.position);
    if (distance < HUMAN_INTERACTION_RANGE) {
      human.activeAction = 'gathering';
      human.direction = { x: 0, y: 0 };
      human.targetPosition = undefined;
    } else {
      human.activeAction = 'moving';
      human.targetPosition = { ...target.position };
      const dirToTarget = getDirectionVectorOnTorus(
        human.position,
        target.position,
        context.gameState.mapDimensions.width,
        context.gameState.mapDimensions.height,
      );
      human.direction = vectorNormalize(dirToTarget);
    }
  }
}
