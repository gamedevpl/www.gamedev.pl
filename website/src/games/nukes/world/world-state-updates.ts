import { WorldState } from './world-state-types';
import { WORLD_UPDATE_STEP } from './world-state-constants';
import { generateLaunches } from './update-world/generate-launches';
import { strategyUpdate } from './update-world/strategy-update';
import { updateMissilePositions } from './update-world/update-missile-positions';
import { updateInterceptorPositions } from './update-world/update-interceptor-positions';
import { handleMissileInterceptions } from './update-world/handle-missile-interceptions';
import { handleExplosions } from './update-world/handle-explosions';
import { updateLaunchSiteModes } from './update-world/update-launch-site-modes';
import { launchNewMissilesAndInterceptors } from './update-world/launch-new-missiles-and-interceptors';
import { updateCityAndStatePopulations } from './update-world/update-city-and-state-populations';

export function updateWorldState(state: WorldState, deltaTime: number): WorldState {
  while (deltaTime > 0) {
    const worldState = worldUpdateIteration(state, deltaTime > WORLD_UPDATE_STEP ? WORLD_UPDATE_STEP : deltaTime);
    deltaTime = deltaTime > WORLD_UPDATE_STEP ? deltaTime - WORLD_UPDATE_STEP : 0;
    state = worldState;
  }

  return state;
}

function worldUpdateIteration(state: WorldState, deltaTime: number): WorldState {
  const worldTimestamp = state.timestamp + deltaTime;

  let result: WorldState = {
    timestamp: worldTimestamp,
    states: state.states,
    cities: state.cities,
    launchSites: state.launchSites,
    missiles: state.missiles,
    interceptors: state.interceptors,
    units: state.units,
    explosions: state.explosions,
    sectors: state.sectors,
  };

  result = updateMissilePositions(result, worldTimestamp);
  result = updateInterceptorPositions(result, deltaTime);
  result = handleMissileInterceptions(result);
  result = handleExplosions(result, state, worldTimestamp);
  result = updateLaunchSiteModes(result, worldTimestamp);
  result = launchNewMissilesAndInterceptors(result, state, worldTimestamp);
  result = updateCityAndStatePopulations(result);

  result = generateLaunches(result);
  result = strategyUpdate(result);

  return result;
}
