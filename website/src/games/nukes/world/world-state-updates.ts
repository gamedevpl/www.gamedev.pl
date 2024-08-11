import { distance } from '../math/position-utils';
import { Missile, WorldState, State, CityId, Interceptor, LaunchSiteMode } from './world-state-types';
import {
  EXPLOSION_DAMAGE_RATIO,
  EXPLOSION_DURATION,
  EXPLOSION_RADIUS,
  LAUNCH_COOLDOWN,
  MIN_EXPLOSION_DAMAGE,
  MISSILE_SPEED,
  WORLD_UPDATE_STEP,
  INTERCEPTOR_SPEED,
  INTERCEPTOR_LAUNCH_COOLDOWN,
  INTERCEPT_RADIUS,
  INTERCEPTOR_MAX_RANGE,
  MODE_CHANGE_DURATION,
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
    interceptors: state.interceptors,
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

  // Update current position of interceptors
  for (const interceptor of result.interceptors) {
    const targetMissile = result.missiles.find((m) => m.id === interceptor.targetMissileId);
    if (!targetMissile) {
      interceptor.targetMissileId = undefined;
    }

    const dx = targetMissile ? targetMissile.position.x - interceptor.position.x : Math.cos(interceptor.direction);
    const dy = targetMissile ? targetMissile.position.y - interceptor.position.y : Math.sin(interceptor.direction);
    const distanceToTarget = Math.sqrt(dx * dx + dy * dy);
    interceptor.direction = Math.atan2(dy, dx);

    if (targetMissile && distanceToTarget <= INTERCEPTOR_SPEED * deltaTime) {
      // Interceptor has reached the missile
      interceptor.position = { ...targetMissile.position };
    } else {
      // Move towards the missile
      const moveFraction = (INTERCEPTOR_SPEED * deltaTime) / distanceToTarget;
      interceptor.position = {
        x: interceptor.position.x + dx * moveFraction,
        y: interceptor.position.y + dy * moveFraction,
      };
    }

    interceptor.tail = [...interceptor.tail.slice(-100), { timestamp: worldTimestamp, position: interceptor.position }];

    // Check if interceptor has exceeded its maximum range
    const distanceTraveled = INTERCEPTOR_SPEED * (worldTimestamp - interceptor.launchTimestamp);
    if (distanceTraveled > interceptor.maxRange) {
      // Remove the interceptor if it has exceeded its range
      result.interceptors = result.interceptors.filter((i) => i.id !== interceptor.id);
    }
  }

  // Check for missile interceptions
  for (const interceptor of result.interceptors) {
    const targetMissile = result.missiles.find((m) => m.id === interceptor.targetMissileId);
    if (targetMissile) {
      const dist = distance(
        interceptor.position.x,
        interceptor.position.y,
        targetMissile.position.x,
        targetMissile.position.y,
      );
      if (dist < INTERCEPT_RADIUS) {
        // Interceptor has caught the missile
        result.missiles = result.missiles.filter((m) => m.id !== targetMissile.id);
        result.interceptors = result.interceptors.filter((i) => i.id !== interceptor.id);
      }
    }
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

    // convert explosions to sector population changes

    // find sectors which are in explosion radius
    for (const sector of state.sectors.filter(
      (sector) =>
        distance(sector.position.x, sector.position.y, explosion.position.x, explosion.position.y) <= explosion.radius,
    )) {
      // reduce population by half
      if (sector.population) {
        const damage = Math.max(MIN_EXPLOSION_DAMAGE, sector.population * EXPLOSION_DAMAGE_RATIO);
        sector.population = Math.max(0, sector.population - damage);
      }
    }

    // explosions destroy missiles and interceptors

    // get missiles and interceptors which are in flight during explosion
    const missiles = state.missiles
      .filter(
        (missile) =>
          missile.id !== explosion.missileId &&
          missile.launchTimestamp <= explosion.startTimestamp &&
          missile.targetTimestamp >= explosion.startTimestamp,
      )
      .filter((missile) => {
        // check if missile is in explosion radius
        return (
          distance(missile.position.x, missile.position.y, explosion.position.x, explosion.position.y) <=
          explosion.radius
        );
      });

    const interceptors = state.interceptors
      .filter((interceptor) => interceptor.launchTimestamp <= explosion.startTimestamp)
      .filter((interceptor) => {
        // check if interceptor is in explosion radius
        return (
          distance(interceptor.position.x, interceptor.position.y, explosion.position.x, explosion.position.y) <=
          explosion.radius
        );
      });

    for (const missile of missiles) {
      // modify missile targetTimestamp to moment of explosion
      missile.targetTimestamp = explosion.startTimestamp;
    }

    for (const interceptor of interceptors) {
      // remove interceptor
      result.interceptors = result.interceptors.filter((i) => i.id !== interceptor.id);
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

  // Handle launch site mode changes
  for (const launchSite of result.launchSites) {
    if (launchSite.modeChangeTimestamp && worldTimestamp >= launchSite.modeChangeTimestamp + MODE_CHANGE_DURATION) {
      launchSite.mode = launchSite.mode === LaunchSiteMode.ATTACK ? LaunchSiteMode.DEFENCE : LaunchSiteMode.ATTACK;
      launchSite.modeChangeTimestamp = undefined;
    }
  }

  // Launch new missiles or interceptors
  for (const launchSite of state.launchSites) {
    if (!launchSite.nextLaunchTarget) {
      // No target
      continue;
    } else if (
      !!launchSite.lastLaunchTimestamp &&
      worldTimestamp - launchSite.lastLaunchTimestamp <
        (launchSite.mode === LaunchSiteMode.ATTACK ? LAUNCH_COOLDOWN : INTERCEPTOR_LAUNCH_COOLDOWN)
    ) {
      // Not ready to launch yet
      continue;
    }

    if (launchSite.mode === LaunchSiteMode.ATTACK && launchSite.nextLaunchTarget?.type === 'position') {
      const missile: Missile = {
        id: Math.random() + '',
        stateId: launchSite.stateId,
        launchSiteId: launchSite.id,
        launch: launchSite.position,
        launchTimestamp: worldTimestamp,
        position: launchSite.position,
        target: launchSite.nextLaunchTarget.position,
        targetTimestamp:
          worldTimestamp +
          distance(
            launchSite.position.x,
            launchSite.position.y,
            launchSite.nextLaunchTarget.position.x,
            launchSite.nextLaunchTarget.position.y,
          ) /
            MISSILE_SPEED,
      };
      result.missiles.push(missile);
    } else if (launchSite.mode === LaunchSiteMode.DEFENCE && launchSite.nextLaunchTarget?.type === 'missile') {
      const targetMissileId = launchSite.nextLaunchTarget.missileId;
      if (targetMissileId) {
        const interceptor: Interceptor = {
          id: Math.random() + '',
          stateId: launchSite.stateId,
          launchSiteId: launchSite.id,
          launch: launchSite.position,
          launchTimestamp: worldTimestamp,
          position: launchSite.position,
          direction: 0,
          tail: [],
          targetMissileId: targetMissileId,
          maxRange: INTERCEPTOR_MAX_RANGE,
        };
        result.interceptors.push(interceptor);
      }
    }

    launchSite.lastLaunchTimestamp = worldTimestamp;
    launchSite.nextLaunchTarget = undefined;
  }

  // Recalculate city populations based on their sectors
  const cityPopulations = result.sectors.reduce(
    (r, sector) => {
      if (!sector.cityId) {
        return r;
      }

      r[sector.cityId] = r[sector.cityId] ? r[sector.cityId] + (sector.population ?? 0) : (sector.population ?? 0);
      return r;
    },
    {} as Record<CityId, number>,
  );
  for (const city of result.cities) {
    city.population = cityPopulations[city.id];
  }

  // Calculate and set population for each state
  result.states = result.states.map((state: State) => {
    const statePopulation = result.cities
      .filter((city) => city.stateId === state.id)
      .reduce((sum, city) => sum + city.population, 0);
    return { ...state, population: statePopulation };
  });

  result = generateLaunches(result);

  result = strategyUpdate(result);

  return result;
}
