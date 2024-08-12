import { WorldState, Missile, Explosion } from '../world-state-types';
import {
  EXPLOSION_DURATION,
  EXPLOSION_RADIUS,
  EXPLOSION_DAMAGE_RATIO,
  MIN_EXPLOSION_DAMAGE,
} from '../world-state-constants';
import { distance } from '../../math/position-utils';

export function handleExplosions(state: WorldState, prevState: WorldState, worldTimestamp: number): WorldState {
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

function createExplosion(missile: Missile): Explosion {
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
