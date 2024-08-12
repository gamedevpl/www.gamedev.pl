import { distance } from '../math/position-utils';
import {
  Missile,
  WorldState,
  State,
  CityId,
  Interceptor,
  LaunchSiteMode,
  LaunchSite,
  City,
  Explosion,
  Position,
} from './world-state-types';
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

function updateMissilePositions(state: WorldState, worldTimestamp: number): WorldState {
  // Update current position of missiles
  for (const missile of state.missiles) {
    const progress = (worldTimestamp - missile.launchTimestamp) / (missile.targetTimestamp - missile.launchTimestamp);
    missile.position = {
      x: missile.launch.x + (missile.target.x - missile.launch.x) * progress,
      y: missile.launch.y + (missile.target.y - missile.launch.y) * progress,
    };
  }
  return state;
}

function updateInterceptorPositions(state: WorldState, deltaTime: number): WorldState {
  // Update current position of interceptors
  state.interceptors = state.interceptors.filter((interceptor) => {
    const targetMissile = state.missiles.find((m) => m.id === interceptor.targetMissileId);
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

    interceptor.tail = [
      ...interceptor.tail.slice(-100),
      { timestamp: state.timestamp, position: interceptor.position },
    ];

    // Check if interceptor has exceeded its maximum range
    const distanceTraveled = INTERCEPTOR_SPEED * (state.timestamp - interceptor.launchTimestamp);
    return distanceTraveled <= interceptor.maxRange;
  });

  return state;
}

function handleMissileInterceptions(state: WorldState): WorldState {
  // Check for missile interceptions
  for (const interceptor of state.interceptors) {
    const targetMissile = state.missiles.find((m) => m.id === interceptor.targetMissileId);
    if (targetMissile) {
      const dist = distance(
        interceptor.position.x,
        interceptor.position.y,
        targetMissile.position.x,
        targetMissile.position.y,
      );
      if (dist < INTERCEPT_RADIUS) {
        // Interceptor has caught the missile
        state.missiles = state.missiles.filter((m) => m.id !== targetMissile.id);
        state.interceptors = state.interceptors.filter((i) => i.id !== interceptor.id);
      }
    }
  }
  return state;
}

function handleExplosions(state: WorldState, prevState: WorldState, worldTimestamp: number): WorldState {
  // When missile reaches its target, it should create an explosion
  for (const missile of prevState.missiles.filter((m) => m.targetTimestamp <= worldTimestamp)) {
    const explosion = createExplosion(missile);
    state.explosions.push(explosion);
    state = applyExplosionDamage(state, explosion);
    state = destroyMissilesAndInterceptorsInExplosion(state, explosion, prevState);
    state = damagelaunchSitesInExplosion(state, explosion, prevState);
  }

  // Remove explosions which already finished
  state.explosions = state.explosions.filter((e) => e.endTimestamp >= worldTimestamp);
  // Remove missiles which already reached their target
  state.missiles = state.missiles.filter((m) => m.targetTimestamp > worldTimestamp);

  return state;
}

function createExplosion(missile: Missile) {
  return {
    id: `explosion-${Math.random()}`,
    missileId: missile.id,
    startTimestamp: missile.targetTimestamp,
    endTimestamp: missile.targetTimestamp + EXPLOSION_DURATION,
    position: missile.target,
    radius: EXPLOSION_RADIUS,
  };
}

function applyExplosionDamage(state: WorldState, explosion: Explosion): WorldState {
  // convert explosions to sector population changes

  // find sectors which are in explosion radius
  for (const sector of state.sectors.filter(
    (sector) =>
      distance(sector.position.x, sector.position.y, explosion.position.x, explosion.position.y) <= explosion.radius,
  )) {
    // reduce population
    if (sector.population) {
      const damage = Math.max(MIN_EXPLOSION_DAMAGE, sector.population * EXPLOSION_DAMAGE_RATIO);
      sector.population = Math.max(0, sector.population - damage);
    }
  }
  return state;
}

function destroyMissilesAndInterceptorsInExplosion(
  state: WorldState,
  explosion: Explosion,
  prevState: WorldState,
): WorldState {
  // explosions destroy missiles and interceptors

  // get missiles and interceptors which are in flight during explosion
  const missilesToDestroy = prevState.missiles.filter(
    (missile) =>
      missile.id !== explosion.missileId &&
      missile.launchTimestamp <= explosion.startTimestamp &&
      missile.targetTimestamp >= explosion.startTimestamp &&
      distance(missile.position.x, missile.position.y, explosion.position.x, explosion.position.y) <= explosion.radius,
  );

  for (const missile of missilesToDestroy) {
    // modify missile targetTimestamp to moment of explosion
    missile.targetTimestamp = explosion.startTimestamp;
  }

  // check if interceptor is in explosion radius
  state.interceptors = state.interceptors.filter(
    (interceptor) =>
      !(
        interceptor.launchTimestamp <= explosion.startTimestamp &&
        distance(interceptor.position.x, interceptor.position.y, explosion.position.x, explosion.position.y) <=
          explosion.radius
      ),
  );

  return state;
}

function damagelaunchSitesInExplosion(state: WorldState, explosion: Explosion, prevState: WorldState): WorldState {
  // Add damage to launch sites
  const affectedLaunchSites = prevState.launchSites.filter(
    (launchSite) =>
      distance(launchSite.position.x, launchSite.position.y, explosion.position.x, explosion.position.y) <=
      explosion.radius,
  );
  state.launchSites = state.launchSites.filter((ls) => !affectedLaunchSites.some((als) => als.id === ls.id));
  return state;
}

function updateLaunchSiteModes(state: WorldState, worldTimestamp: number): WorldState {
  for (const launchSite of state.launchSites) {
    if (launchSite.modeChangeTimestamp && worldTimestamp >= launchSite.modeChangeTimestamp + MODE_CHANGE_DURATION) {
      launchSite.mode = launchSite.mode === LaunchSiteMode.ATTACK ? LaunchSiteMode.DEFENCE : LaunchSiteMode.ATTACK;
      launchSite.modeChangeTimestamp = undefined;
    }
  }
  return state;
}

function launchNewMissilesAndInterceptors(
  state: WorldState,
  prevState: WorldState,
  worldTimestamp: number,
): WorldState {
  for (const launchSite of prevState.launchSites) {
    if (!launchSite.nextLaunchTarget) {
      // No target
      continue;
    }
    if (
      !!launchSite.lastLaunchTimestamp &&
      worldTimestamp - launchSite.lastLaunchTimestamp <
        (launchSite.mode === LaunchSiteMode.ATTACK ? LAUNCH_COOLDOWN : INTERCEPTOR_LAUNCH_COOLDOWN)
    ) {
      // Not ready to launch yet
      continue;
    }

    if (launchSite.mode === LaunchSiteMode.ATTACK && launchSite.nextLaunchTarget?.type === 'position') {
      state.missiles.push(createMissile(launchSite, launchSite.nextLaunchTarget.position, worldTimestamp));
    } else if (launchSite.mode === LaunchSiteMode.DEFENCE && launchSite.nextLaunchTarget?.type === 'missile') {
      const targetMissileId = launchSite.nextLaunchTarget.missileId;
      if (targetMissileId) {
        state.interceptors.push(createInterceptor(launchSite, worldTimestamp, targetMissileId));
      }
    }

    launchSite.lastLaunchTimestamp = worldTimestamp;
    launchSite.nextLaunchTarget = undefined;
  }
  return state;
}

function createMissile(launchSite: LaunchSite, targetPosition: Position, worldTimestamp: number): Missile {
  return {
    id: Math.random() + '',
    stateId: launchSite.stateId,
    launchSiteId: launchSite.id,
    launch: launchSite.position,
    launchTimestamp: worldTimestamp,
    position: launchSite.position,
    target: targetPosition,
    targetTimestamp:
      worldTimestamp +
      distance(launchSite.position.x, launchSite.position.y, targetPosition.x, targetPosition.y) / MISSILE_SPEED,
  };
}

function createInterceptor(launchSite: LaunchSite, worldTimestamp: number, targetMissileId: string): Interceptor {
  return {
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
}

function updateCityAndStatePopulations(state: WorldState): WorldState {
  // Recalculate city populations based on their sectors
  const cityPopulations = state.sectors.reduce(
    (r, sector) => {
      if (!sector.cityId) {
        return r;
      }

      r[sector.cityId] = r[sector.cityId] ? r[sector.cityId] + (sector.population ?? 0) : (sector.population ?? 0);
      return r;
    },
    {} as Record<CityId, number>,
  );

  // Calculate and set population for each state
  for (const city of state.cities) {
    city.population = cityPopulations[city.id];
  }

  state.states = state.states.map((s: State) => {
    const statePopulation = state.cities
      .filter((city) => city.stateId === s.id)
      .reduce((sum: number, city: City) => sum + city.population, 0);
    return { ...s, population: statePopulation };
  });

  return state;
}
