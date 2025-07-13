import { HumanEntity } from '../../../entities/characters/human/human-types';
import { UpdateContext } from '../../../world-types';
import { Goal, GoalType } from '../goals/goal-types';
import { Action, ActionType } from './action-types';
import { findClosestEntity } from '../../../utils/world-utils';
import { BerryBushEntity } from '../../../entities/plants/berry-bush/berry-bush-types';
import { HumanCorpseEntity } from '../../../entities/characters/human/human-corpse-types';
import { calculateWrappedDistance, getDirectionVectorOnTorus, vectorNormalize } from '../../../utils/math-utils';
import { HUMAN_INTERACTION_PROXIMITY } from '../../../world-consts';

type FoodSource = BerryBushEntity | HumanCorpseEntity;

function findBestFoodSource(human: HumanEntity, context: UpdateContext): FoodSource | null {
  const closestBush = findClosestEntity<BerryBushEntity>(
    human,
    context.gameState,
    'berryBush',
    undefined,
    (b) => b.food.length > 0,
  );

  const closestCorpse = findClosestEntity<HumanCorpseEntity>(
    human,
    context.gameState,
    'humanCorpse',
    undefined,
    (c) => c.food.length > 0,
  );

  if (closestBush && closestCorpse) {
    const distToBush = calculateWrappedDistance(
      human.position,
      closestBush.position,
      context.gameState.mapDimensions.width,
      context.gameState.mapDimensions.height,
    );
    const distToCorpse = calculateWrappedDistance(
      human.position,
      closestCorpse.position,
      context.gameState.mapDimensions.width,
      context.gameState.mapDimensions.height,
    );
    return distToBush <= distToCorpse ? closestBush : closestCorpse;
  }

  return closestBush || closestCorpse;
}

export const gatherFoodAction: Action = {
  type: ActionType.GATHER_FOOD,

  getUtility(human: HumanEntity, context: UpdateContext, goal: Goal): number {
    if (goal.type !== GoalType.GATHER_FOOD) {
      return 0;
    }

    if (human.food.length >= human.maxFood) {
      return 0; // No capacity to gather more.
    }

    const closestFoodSource = findBestFoodSource(human, context);

    // If a food source exists, this action is viable.
    // The score could be refined by distance, but for now, a flat score is fine.
    return closestFoodSource ? 0.7 : 0;
  },

  execute(human: HumanEntity, context: UpdateContext): void {
    const target = findBestFoodSource(human, context);

    if (!target) {
      // Should not happen if utility was > 0, but as a safeguard.
      human.activeAction = 'idle';
      return;
    }

    const distance = calculateWrappedDistance(
      human.position,
      target.position,
      context.gameState.mapDimensions.width,
      context.gameState.mapDimensions.height,
    );

    if (distance < HUMAN_INTERACTION_PROXIMITY) {
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
  },
};
