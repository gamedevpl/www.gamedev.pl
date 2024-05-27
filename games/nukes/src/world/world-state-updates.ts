import { distance } from '../math/position-utils';
import { WorldState } from './world-state-types';

export function updateWorldState(state: WorldState, deltaTime: number): WorldState {
  const worldTimestamp = state.timestamp + deltaTime;

  const result: WorldState = {
    timestamp: worldTimestamp,
    states: state.states,
    cities: state.cities,
    launchSites: state.launchSites,
    missiles: state.missiles,
    explosions: state.explosions,
    sectors: state.sectors,
  };

  // convert explosions to population changes
  for (const explosion of state.explosions.filter(
    (e) => e.startTimestamp >= state.timestamp && e.startTimestamp < worldTimestamp,
  )) {
    // find cities which are in explosion radius
    for (const city of state.cities.filter(
      (city) =>
        distance(city.position.x, city.position.y, explosion.position.x, explosion.position.y) <= explosion.radius,
    )) {
      // reduce population by half
      city.populationHistogram.push({
        timestamp: explosion.startTimestamp,
        population: Math.floor(city.populationHistogram[city.populationHistogram.length - 1].population / 2),
      });
    }
  }

  return result;
}
