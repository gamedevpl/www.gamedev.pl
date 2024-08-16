import { Explosion, Missile, Sector, WorldState, Interceptor, Unit, Battle } from './world-state-types';
import { calculateWaterDepthAndGroundHeight } from './create-world/sector-generation';
import { generateStates } from './create-world/state-generation';
import { initializeSectors } from './create-world/sector-generation';
import { dislocateStateUnits } from './create-world/unit-dislocator';
import { INITIAL_STATE_UNITS } from './world-state-constants';
import { createDefenceLines } from './create-world/defence-line-generation';
import { indexWorldState } from './world-state-index';

export function createWorldState({
  playerStateName,
  numberOfStates = 3,
  groundWarfare,
}: {
  playerStateName: string;
  numberOfStates: number;
  groundWarfare: boolean;
}): WorldState {
  const worldWidth = Math.max(200, Math.ceil(Math.sqrt(numberOfStates) * 10));
  const worldHeight = worldWidth;

  const sectors: Sector[] = initializeSectors(worldWidth, worldHeight);

  const { states, cities, launchSites } = generateStates(
    numberOfStates,
    playerStateName,
    worldWidth,
    worldHeight,
    sectors,
  );

  // Calculate water depth and ground height
  calculateWaterDepthAndGroundHeight(sectors, worldWidth, worldHeight);

  const missiles: Missile[] = [];
  const explosions: Explosion[] = [];
  const interceptors: Interceptor[] = [];
  const units: Unit[] = [];
  const battles: Battle[] = [];

  const result = {
    timestamp: 0,
    states,
    cities,
    launchSites,
    sectors,
    units,
    missiles,
    explosions,
    interceptors,
    battles,
  };

  if (groundWarfare) {
    const indexedResult = indexWorldState(result, true);

    // Initialize strategic defence lines for each state
    states.forEach((state) => {
      state.defenceLines = createDefenceLines(state, indexedResult);
      state.currentDefenceLineIndex = 0;
    });

    // Dislocate units
    for (const state of states) {
      units.push(...dislocateStateUnits(sectors, state, INITIAL_STATE_UNITS));
    }
  }

  return result;
}
