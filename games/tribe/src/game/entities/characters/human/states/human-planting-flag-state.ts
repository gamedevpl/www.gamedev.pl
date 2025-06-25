import { State } from '../../../../state-machine/state-machine-types';
import { FLAG_PLANTING_DURATION_HOURS, FLAG_PLANTING_COST } from '../../../../world-consts';
import { HumanEntity } from '../human-types';
import { HUMAN_IDLE, HUMAN_PLANTING_FLAG, HumanPlantingFlagStateData } from './human-state-types';
import { createFlag } from '../../../entities-update';
import { FoodType } from '../../../../food/food-types';

export const humanPlantingFlagState: State<HumanEntity, HumanPlantingFlagStateData> = {
  id: HUMAN_PLANTING_FLAG,
  update: (data, context) => {
    const { entity, updateContext } = context;
    const { gameState } = updateContext;

    // If we are here, we are at the planting spot. Start the timer if not already started.
    if (!data.plantingStartedAt) {
      data.plantingStartedAt = gameState.time;
    }

    const timeInPlanting = gameState.time - data.plantingStartedAt;

    if (timeInPlanting >= FLAG_PLANTING_DURATION_HOURS) {
      if (entity.leaderId && entity.tribeBadge) {
        // Consume resources
        let berriesConsumed = 0;
        entity.food = entity.food.filter((item) => {
          if (item.type === FoodType.Berry && berriesConsumed < FLAG_PLANTING_COST) {
            berriesConsumed++;
            return false;
          }
          return true;
        });

        // Create the flag
        createFlag(gameState.entities, entity.position, gameState.time, entity.leaderId, entity.tribeBadge);
      }

      entity.activeAction = 'idle';
      return { nextState: HUMAN_IDLE, data: { ...data, plantingStartedAt: undefined } };
    }

    if (entity.activeAction !== 'plantingFlag') {
      return { nextState: HUMAN_IDLE, data: { ...data, plantingStartedAt: undefined } };
    }

    return { nextState: HUMAN_PLANTING_FLAG, data };
  },
  onExit: (context) => {
    const { entity } = context;
    entity.targetPosition = undefined;
    if (entity.stateMachine) {
      const stateData = entity.stateMachine[1] as HumanPlantingFlagStateData;
      stateData.plantingStartedAt = undefined;
    }
  },
};
