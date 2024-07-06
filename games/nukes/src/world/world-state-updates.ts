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
        population: Math.max(
          0,
          city.populationHistogram[city.populationHistogram.length - 1].population -
            Math.floor(city.populationHistogram[city.populationHistogram.length - 1].population / 2),
        ),
      });
    }
  }

  // explosions destroy missiles
  for (const explosion of state.explosions.filter(
    (e) => e.startTimestamp >= state.timestamp && e.startTimestamp < worldTimestamp,
  )) {
    // get missiles which are in flight during explosion
    const missiles = state.missiles
      .filter(
        (missile) =>
          missile.id !== explosion.missileId &&
          missile.launchTimestamp <= explosion.startTimestamp &&
          missile.targetTimestamp >= explosion.startTimestamp,
      )
      .filter((missile) => {
        // Calculate missile position at the time of explosion
        const explosionTime = explosion.startTimestamp;
        const { x, y } = {
          x:
            missile.launch.x +
            ((missile.target.x - missile.launch.x) / (missile.targetTimestamp - missile.launchTimestamp)) *
              (explosionTime - missile.launchTimestamp),
          y:
            missile.launch.y +
            ((missile.target.y - missile.launch.y) / (missile.targetTimestamp - missile.launchTimestamp)) *
              (explosionTime - missile.launchTimestamp),
        };

        // check if missle is in explosion radius
        return distance(x, y, explosion.position.x, explosion.position.y) <= explosion.radius;
      });

    for (const missile of missiles) {
      // modify missle targetTimestamp to moment of explosion
      missile.targetTimestamp = explosion.startTimestamp;

      // delete explosion of the missle
      result.explosions = result.explosions.filter((e) => e.missileId !== missile.id);
    }
  }

  return result;
}
