import { distance } from '../math/position-utils';
import { Missile, WorldState } from './world-state-types';
import {
  EXPLOSION_DAMAGE_RATIO,
  EXPLOSION_DURATION,
  EXPLOSION_RADIUS,
  LAUNCH_COOLDOWN,
  MIN_EXPLOSION_DAMAGE,
  MISSILE_SPEED,
  WORLD_UPDATE_STEP,
} from './world-state-constants';
import { generateLaunches } from './generate-launches';
import { strategyUpdate } from './strategy-update';

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
    explosions: state.explosions,
    sectors: state.sectors,
  };

  // Update current position of missiles
  for (const missile of result.missiles) {
    const progress = (worldTimestamp - missile.launchTimestamp) / (missile.targetTimestamp - missile.launchTimestamp);
    missile.position = {
      x: missile.launch.x + (missile.target.x - missile.launch.x) * progress,
      y: missile.launch.y + (missile.target.y - missile.launch.y) * progress,
    };
  }

  // When missile reaches its target, it should create an explosion
  for (const missile of state.missiles.filter((m) => m.targetTimestamp <= worldTimestamp)) {
    const explosion = {
      id: `explosion-${Math.random()}`,
      missileId: missile.id,
      startTimestamp: missile.targetTimestamp,
      endTimestamp: missile.targetTimestamp + EXPLOSION_DURATION,
      position: missile.target,
      radius: EXPLOSION_RADIUS,
    };

    result.explosions.push(explosion);

    // convert explosions to population changes

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

    // explosions destroy missiles

    // get missiles which are in flight during explosion
    const missiles = state.missiles
      .filter(
        (missile) =>
          missile.id !== explosion.missileId &&
          missile.launchTimestamp <= explosion.startTimestamp &&
          missile.targetTimestamp >= explosion.startTimestamp,
      )
      .filter((missile) => {
        // check if missle is in explosion radius
        return (
          distance(missile.position.x, missile.position.y, explosion.position.x, explosion.position.y) <=
          explosion.radius
        );
      });

    for (const missile of missiles) {
      // modify missle targetTimestamp to moment of explosion
      missile.targetTimestamp = explosion.startTimestamp;
    }

    // Add damage to launch sites
    const affectedLaunchSites = state.launchSites.filter(
      (launchSite) =>
        distance(launchSite.position.x, launchSite.position.y, explosion.position.x, explosion.position.y) <=
        explosion.radius,
    );
    for (const launchSite of affectedLaunchSites) {
      result.launchSites = state.launchSites.filter((ls) => ls.id !== launchSite.id);
    }
  }

  // Remove explosions which already finished
  result.explosions = result.explosions.filter((e) => e.endTimestamp >= worldTimestamp);

  // Remove missiles which already reached their target
  result.missiles = result.missiles.filter((m) => m.targetTimestamp > worldTimestamp);

  // Launch new missiles
  for (const launchSite of state.launchSites) {
    if (!launchSite.nextLaunchTarget) {
      // No target
      continue;
    } else if (!!launchSite.lastLaunchTimestamp && worldTimestamp - launchSite.lastLaunchTimestamp < LAUNCH_COOLDOWN) {
      // Not ready to launch yet
      continue;
    }

    const dist = distance(
      launchSite.position.x,
      launchSite.position.y,
      launchSite.nextLaunchTarget.x,
      launchSite.nextLaunchTarget.y,
    );

    const missile: Missile = {
      id: Math.random() + '',

      stateId: launchSite.stateId,
      launchSiteId: launchSite.id,

      launch: launchSite.position,
      launchTimestamp: worldTimestamp,

      position: launchSite.position,

      target: launchSite.nextLaunchTarget,
      targetTimestamp: worldTimestamp + dist / MISSILE_SPEED,
    };

    result.missiles.push(missile);
    launchSite.lastLaunchTimestamp = worldTimestamp;
    launchSite.nextLaunchTarget = undefined;
  }

  result = generateLaunches(result);

  result = strategyUpdate(result);

  return result;
}
