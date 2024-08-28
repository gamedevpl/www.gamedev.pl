import { WorldState, Missile, Explosion } from '../world-state-types';
import {
  EXPLOSION_DURATION,
  EXPLOSION_RADIUS,
  EXPLOSION_DAMAGE_RATIO,
  MIN_EXPLOSION_DAMAGE,
} from '../world-state-constants';
import { distance } from '../../math/position-utils';
import { IndexedWorldState } from '../world-state-index';

export function handleExplosions(state: IndexedWorldState): void {
  // When missile reaches its target, it should create an explosion
  for (const missile of state.missiles.filter((m) => m.targetTimestamp <= state.timestamp)) {
    const explosion = createExplosion(missile);
    state.explosions.push(explosion);
    applyExplosionDamage(state, explosion);
    destroyMissilesAndInterceptorsInExplosion(state, explosion);
    damageLaunchSitesInExplosion(state, explosion);
    damageUnitsinExplosion(state, explosion);
  }

  // Remove explosions which already finished
  state.explosions = state.explosions.filter((e) => e.endTimestamp >= state.timestamp);
  // Remove missiles which already reached their target
  state.missiles = state.missiles.filter((m) => m.targetTimestamp > state.timestamp);
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

function applyExplosionDamage(state: IndexedWorldState, explosion: Explosion): WorldState {
  // convert explosions to sector population changes

  // find sectors which are in explosion radius
  for (const sector of state.searchSector.byRadius(explosion.position, explosion.radius)) {
    // reduce population
    if (sector.population) {
      const damage = Math.max(MIN_EXPLOSION_DAMAGE, sector.population * EXPLOSION_DAMAGE_RATIO);
      sector.population = Math.max(0, sector.population - damage);
    }
  }
  return state;
}

function destroyMissilesAndInterceptorsInExplosion(state: IndexedWorldState, explosion: Explosion): void {
  // explosions destroy missiles and interceptors

  // get missiles and interceptors which are in flight during explosion
  const missilesToDestroy = state.searchMissile
    .byRadius(explosion.position, explosion.radius)
    .filter(
      (missile) =>
        missile.id !== explosion.missileId &&
        missile.launchTimestamp <= explosion.startTimestamp &&
        missile.targetTimestamp >= explosion.startTimestamp,
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
}

function damageLaunchSitesInExplosion(state: IndexedWorldState, explosion: Explosion): void {
  // Add damage to launch sites
  const affectedLaunchSites = state.searchLaunchSite.byRadius(explosion.position, explosion.radius);
  state.launchSites = state.launchSites.filter((ls) => !affectedLaunchSites.some((als) => als.id === ls.id));
}

function damageUnitsinExplosion(state: IndexedWorldState, explosion: Explosion): void {
  // Find units which are in range of explosion, and reduce their quantity
  const affectedUnits = state.searchUnit.byRadius(explosion.position, explosion.radius);

  state.units = state.units.map((unit) => {
    const affectedUnit = affectedUnits.find((au) => au.id === unit.id);
    if (affectedUnit) {
      const damage = Math.max(MIN_EXPLOSION_DAMAGE, unit.quantity * EXPLOSION_DAMAGE_RATIO);
      const newQuantity = Math.max(0, unit.quantity - damage);
      return { ...unit, quantity: newQuantity };
    }
    return unit;
  });

  // Remove units which quantity is zero or below zero
  state.units = state.units.filter((unit) => unit.quantity > 0);
}
