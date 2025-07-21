import { State, StateContext, StateTransition } from '../../../../state-machine/state-machine-types';
import { BerryBushEntity } from '../berry-bush-types';
import { BushFullStateData, BUSH_DYING, BUSH_SPREADING, BUSH_FULL, BUSH_GROWING } from './bush-state-types';
import {
  HOURS_PER_GAME_DAY,
  GAME_DAY_IN_REAL_SECONDS,
  BERRY_BUSH_SPREAD_COOLDOWN_HOURS,
} from '../../../../world-consts';
import { addVisualEffect } from '../../../../utils/visual-effects-utils';
import { VisualEffectType } from '../../../../visual-effects/visual-effect-types';
import { EFFECT_DURATION_SHORT_HOURS } from '../../../../world-consts';

export const bushFullState: State<BerryBushEntity, BushFullStateData> = {
  id: BUSH_FULL,
  update: (data: BushFullStateData, context: StateContext<BerryBushEntity>): StateTransition => {
    const { entity, updateContext } = context;
    const gameHoursDelta = updateContext.deltaTime * (HOURS_PER_GAME_DAY / GAME_DAY_IN_REAL_SECONDS);

    entity.age += gameHoursDelta;
    if (entity.age >= entity.lifespan) {
      return {
        nextState: BUSH_DYING,
        data: { ...data, enteredAt: updateContext.gameState.time, previousState: BUSH_FULL },
      };
    }

    // If berries are somehow removed, transition back to growing
    if (entity.food.length < entity.maxFood) {
      return {
        nextState: BUSH_GROWING,
        data: { ...data, enteredAt: updateContext.gameState.time, previousState: BUSH_FULL },
      };
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

    entity.timeSinceLastSpreadAttempt += gameHoursDelta;
    if (entity.timeSinceLastSpreadAttempt >= BERRY_BUSH_SPREAD_COOLDOWN_HOURS) {
      entity.timeSinceLastSpreadAttempt = 0; // Reset cooldown before the next attempt

      const timeSinceHarvest = updateContext.gameState.time - entity.timeSinceLastHarvest;
      const hasBeenLeftAlone = timeSinceHarvest >= BERRY_BUSH_SPREAD_COOLDOWN_HOURS;

      if (hasBeenLeftAlone && Math.random() < entity.spreadChance) {
        return {
          nextState: BUSH_SPREADING,
          data: { ...data, enteredAt: updateContext.gameState.time, previousState: BUSH_FULL },
        };
      }
    }

    return { nextState: BUSH_FULL, data };
  },
  onEnter: (context: StateContext<BerryBushEntity>, nextData: BushFullStateData): BushFullStateData => {
    // context.entity.timeSinceLastSpreadAttempt = 0; // Reset spread attempt timer upon entering full state
    return {
      ...nextData,
      enteredAt: context.updateContext.gameState.time,
    };
  },
};
