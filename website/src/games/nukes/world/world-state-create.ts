import { Explosion, Missile, Sector, WorldState, Interceptor } from './world-state-types';
import { calculateWaterDepthAndGroundHeight } from './create-world/sector-generation';
import { generateStates } from './create-world/state-generation';
import { initializeSectors } from './create-world/sector-generation';

export function createWorldState({
  playerStateName,
  numberOfStates = 3,
}: {
  playerStateName: string;
  numberOfStates: number;
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

  return {
    timestamp: 0,
    states,
    cities,
    launchSites,
    sectors,
    missiles,
    explosions,
    interceptors,
  };
}
