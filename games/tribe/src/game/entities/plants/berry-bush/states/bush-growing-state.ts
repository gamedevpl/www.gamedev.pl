import { State, StateContext, StateTransition } from "../../../../state-machine/state-machine-types";
import { BerryBushEntity } from "../berry-bush-types";
import { BushGrowingStateData, BUSH_DYING, BUSH_FULL, BUSH_GROWING } from "./bush-state-types";
import { HOURS_PER_GAME_DAY, GAME_DAY_IN_REAL_SECONDS } from "../../../../world-consts";

export const bushGrowingState: State<BerryBushEntity, BushGrowingStateData> = {
  id: BUSH_GROWING,
  update: (data: BushGrowingStateData, context: StateContext<BerryBushEntity>): StateTransition => {
    const { entity, updateContext } = context;
    const gameHoursDelta = updateContext.deltaTime * (HOURS_PER_GAME_DAY / GAME_DAY_IN_REAL_SECONDS);

    entity.age += gameHoursDelta;
    if (entity.age >= entity.lifespan) {
      return { nextState: BUSH_DYING, data: { ...data, enteredAt: updateContext.gameState.time } };
    }

    // Check for claim expiration
    if (entity.ownerId && entity.claimedUntil && updateContext.gameState.time > entity.claimedUntil) {
      entity.ownerId = undefined;
      entity.claimedUntil = undefined;
    }

    entity.timeSinceLastBerryRegen += gameHoursDelta;
    // Ensure berryRegenerationRate is positive to avoid division by zero or negative rates
    if (entity.berryRegenerationRate > 0 && entity.timeSinceLastBerryRegen >= (1 / entity.berryRegenerationRate)) {
      if (entity.currentBerries < entity.maxBerries) {
        entity.currentBerries++;
        entity.timeSinceLastBerryRegen = 0;
      }
    }

    if (entity.currentBerries >= entity.maxBerries) {
      return { nextState: BUSH_FULL, data: { ...data, enteredAt: updateContext.gameState.time, previousState: BUSH_GROWING } };
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
  }
};
