import { State, StateContext, StateTransition } from '../../../../state-machine/state-machine-types';
import { BerryBushEntity } from '../berry-bush-types';
import { BushGrowingStateData, BUSH_DYING, BUSH_FULL, BUSH_GROWING } from './bush-state-types';
import {
  HOURS_PER_GAME_DAY,
  GAME_DAY_IN_REAL_SECONDS,
  EFFECT_DURATION_SHORT_HOURS,
} from '../../../../world-consts';
import { addVisualEffect } from '../../../../utils/visual-effects-utils';
import { VisualEffectType } from '../../../../visual-effects/visual-effect-types';
import { FoodType } from '../../../../food/food-types';

export const bushGrowingState: State<BerryBushEntity, BushGrowingStateData> = {
  id: BUSH_GROWING,
  update: (data: BushGrowingStateData, context: StateContext<BerryBushEntity>): StateTransition => {
    const { entity, updateContext } = context;
    const gameHoursDelta = updateContext.deltaTime * (HOURS_PER_GAME_DAY / GAME_DAY_IN_REAL_SECONDS);

    // Berry bush regeneration constant
    const BERRY_BUSH_REGENERATION_HOURS = 12; // Hours for 1 food to grow

    entity.age += gameHoursDelta;
    if (entity.age >= entity.lifespan) {
      return { nextState: BUSH_DYING, data: { ...data, enteredAt: updateContext.gameState.time } };
    }

    // Check for claim expiration
    if (entity.ownerId && entity.claimedUntil && updateContext.gameState.time > entity.claimedUntil) {
      addVisualEffect(
        updateContext.gameState,
        VisualEffectType.BushClaimLost,
        entity.position,
        EFFECT_DURATION_SHORT_HOURS,
      );
      entity.ownerId = undefined;
      entity.claimedUntil = undefined;
    }

    entity.timeSinceLastBerryRegen += gameHoursDelta;

    if (entity.timeSinceLastBerryRegen >= BERRY_BUSH_REGENERATION_HOURS) {
      if (entity.food.length < entity.maxFood) {
        entity.food.push({ type: FoodType.Berry });
        entity.timeSinceLastBerryRegen = 0;
      }
    }

    if (entity.food.length >= entity.maxFood) {
      return {
        nextState: BUSH_FULL,
        data: { ...data, enteredAt: updateContext.gameState.time, previousState: BUSH_GROWING },
      };
    }

    return { nextState: BUSH_GROWING, data };
  },
  onEnter: (context: StateContext<BerryBushEntity>, nextData: BushGrowingStateData): BushGrowingStateData => {
    // Reset timeSinceLastBerryRegen if entering from a different state or for the first time
    // context.entity.timeSinceLastBerryRegen = 0; // Or handle this based on specific transitions
    return {
      ...nextData,
      enteredAt: context.updateContext.gameState.time,
    };
  },
};
