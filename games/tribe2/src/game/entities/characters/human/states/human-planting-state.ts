import { State } from '../../../../state-machine/state-machine-types';
import { HumanEntity } from '../human-types';
import { HumanPlantingStateData, HUMAN_IDLE, HUMAN_PLANTING } from './human-state-types';
import {
  BERRY_COST_FOR_PLANTING,
  HUMAN_PLANTING_DURATION_HOURS,
} from '../../../plants/berry-bush/berry-bush-consts.ts';
import { createBerryBush } from '../../../entities-update';
import { FoodType } from '../../../food-types.ts';
import { applySoilPlantDepletion, isSoilDepleted } from '../../../plants/soil-depletion-update.ts';

export const humanPlantingState: State<HumanEntity, HumanPlantingStateData> = {
  id: HUMAN_PLANTING,
  update: (data, context) => {
    const { entity, updateContext } = context;
    const { gameState } = updateContext;

    const timeInState = gameState.time - data.enteredAt;

    if (timeInState >= HUMAN_PLANTING_DURATION_HOURS) {
      const berryCount = entity.food.filter((f) => f.type === FoodType.Berry).length;

      // Check if soil is depleted - if so, cancel planting
      const soilDepleted = isSoilDepleted(
        gameState.soilDepletion,
        data.plantingSpot,
        gameState.mapDimensions.width,
        gameState.mapDimensions.height,
      );

      if (berryCount >= BERRY_COST_FOR_PLANTING && !soilDepleted) {
        // Consume berries
        for (let i = 0; i < BERRY_COST_FOR_PLANTING; i++) {
          const berryIndex = entity.food.findIndex((f) => f.type === FoodType.Berry);
          if (berryIndex > -1) {
            entity.food.splice(berryIndex, 1);
          }
        }
        // Create a new bush
        createBerryBush(gameState.entities, data.plantingSpot, gameState.time);

        // Apply soil depletion from planting
        applySoilPlantDepletion(
          gameState.soilDepletion,
          data.plantingSpot,
          gameState.time,
          gameState.mapDimensions.width,
          gameState.mapDimensions.height,
          gameState,
        );
      }
      // Transition back to idle
      entity.activeAction = 'idle';
      return {
        nextState: HUMAN_IDLE,
        data: {
          ...data,
          enteredAt: gameState.time,
          previousState: HUMAN_PLANTING,
        },
      };
    }

    return { nextState: HUMAN_PLANTING, data };
  },
  onEnter: (context, nextData) => {
    context.entity.acceleration = 0;
    context.entity.velocity = { x: 0, y: 0 };
    return {
      ...nextData,
      enteredAt: context.updateContext.gameState.time,
    };
  },
};
