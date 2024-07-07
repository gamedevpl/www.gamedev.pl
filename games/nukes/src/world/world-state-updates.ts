import { distance } from '../math/position-utils';
import { WorldState } from './world-state-types';
import { EXPLOSION_DAMAGE_RATIO, MIN_EXPLOSION_DAMAGE } from './world-state-constants';

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
      const lastPopulation = city.populationHistogram[city.populationHistogram.length - 1].population;
      const damage = Math.max(MIN_EXPLOSION_DAMAGE, lastPopulation * EXPLOSION_DAMAGE_RATIO);
      city.populationHistogram.push({
        timestamp: explosion.startTimestamp,
        population: Math.max(0, lastPopulation - damage),
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

      // CODEGEN START
      // find launch site of the destroyed missile
      const launchSite = state.launchSites.find(
        (ls) => ls.position.x === missile.launch.x && ls.position.y === missile.launch.y,
      );
      // if launch site exists, destroy it
      if (launchSite) {
        // remove launch site from the world
        result.launchSites = result.launchSites.filter((ls) => ls.id !== launchSite.id);
      }
      // CODEGEN END
    }
  }

  return result;
}
