import { State, StateContext, StateTransition } from '../../../../state-machine/state-machine-types';
import { BerryBushEntity } from '../berry-bush-types';
import { BushSpreadingStateData, BUSH_DYING, BUSH_FULL, BUSH_SPREADING } from './bush-state-types';
import { isPositionOccupied } from '../../../../utils/world-utils';
import { getRandomNearbyPosition } from '../../../../utils/world-utils';
import { createBerryBush } from '../../../entities-update'; // Adjusted path
import { HOURS_PER_GAME_DAY, GAME_DAY_IN_REAL_SECONDS } from '../../../../world-consts';

export const bushSpreadingState: State<BerryBushEntity, BushSpreadingStateData> = {
  id: BUSH_SPREADING,
  update: (data: BushSpreadingStateData, context: StateContext<BerryBushEntity>): StateTransition => {
    const { entity, updateContext } = context;
    const { gameState } = updateContext;
    const gameHoursDelta = updateContext.deltaTime * (HOURS_PER_GAME_DAY / GAME_DAY_IN_REAL_SECONDS);

    entity.age += gameHoursDelta;
    if (entity.age >= entity.lifespan) {
      return { nextState: BUSH_DYING, data: { ...data, enteredAt: gameState.time, previousState: BUSH_SPREADING } };
    }

    const newPosition = getRandomNearbyPosition(
      entity.position,
      entity.spreadRadius,
      gameState.mapDimensions.width,
      gameState.mapDimensions.height,
    );

    // Using a check radius, e.g., 15 pixels, to avoid bushes spawning too close or overlapping.
    // This radius should ideally be related to the visual size of the bush.
    const SPREAD_CHECK_RADIUS = 15;
    if (!isPositionOccupied(newPosition, gameState, SPREAD_CHECK_RADIUS)) {
      createBerryBush(gameState.entities, newPosition, gameState.time);
    }

    // Always transition back to full after attempting to spread
    return { nextState: BUSH_FULL, data: { ...data, enteredAt: gameState.time, previousState: BUSH_SPREADING } };
  },
  onEnter: (context: StateContext<BerryBushEntity>, nextData: BushSpreadingStateData): BushSpreadingStateData => {
    return {
      ...nextData,
      enteredAt: context.updateContext.gameState.time,
    };
  },
};
