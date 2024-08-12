import {
  Position,
  WorldState,
  Strategy,
  LaunchSiteMode,
  Missile,
  City,
  Sector,
  MissileId,
  Interceptor,
} from '../world-state-types';
import { distance } from '../../math/position-utils';
import { EXPLOSION_RADIUS, CITY_RADIUS } from '../world-state-constants';

/**
 * Plan launches for each state to eliminate other states' populations,
 * considering existing missiles and future explosions.
 *
 * @param state The current world state.
 * @returns A list of new missiles and their corresponding explosions.
 */
export function generateLaunches(worldState: WorldState): WorldState {
  const citySectors = worldState.sectors.filter((sector) => sector.cityId && sector.population! > 0);
  for (const state of worldState.states) {
    const myCities = worldState.cities.filter((city) => city.stateId === state.id);
    const myLaunchSites = worldState.launchSites.filter((launchSite) => launchSite.stateId === state.id);

    const enemyCities = worldState.cities
      .filter(
        (city) =>
          state.strategies[city.stateId] === Strategy.HOSTILE && city.stateId !== state.id && city.population > 0,
      )
      .map((city) => ({ ...city, isCity: true }));
    const enemyMissiles = worldState.missiles.filter(
      (missile) => state.strategies[missile.stateId] !== Strategy.FRIENDLY && missile.stateId !== state.id,
    );
    const enemyLaunchSites = worldState.launchSites
      .filter(
        (launchSite) => state.strategies[launchSite.stateId] === Strategy.HOSTILE && launchSite.stateId !== state.id,
      )
      .map((city) => ({ ...city, isCity: false }));

    // Filter enemy missiles, keep only those which are approaching any of myCities or myLaunchSites
    const threateningMissiles = enemyMissiles
      .filter((missile) => {
        return (
          myCities.some((city) => {
            return isPointClose(missile.target, city.position, EXPLOSION_RADIUS + CITY_RADIUS);
          }) ||
          myLaunchSites.some((launchSite) => {
            return isPointClose(missile.target, launchSite.position, EXPLOSION_RADIUS);
          })
        );
      })
      // Ignore missiles which are early in flight
      .filter(
        (missile) =>
          (worldState.timestamp - missile.launchTimestamp) / (missile.targetTimestamp - missile.launchTimestamp) > 0.5,
      );

    for (const launchSite of worldState.launchSites.filter((launchSite) => launchSite.stateId === state.id)) {
      if (launchSite.nextLaunchTarget) {
        continue;
      } else if (enemyCities.length === 0 && enemyLaunchSites.length === 0 && enemyMissiles.length === 0) {
        break;
      }

      if (
        // No threats, no need to be in defence mode
        (threateningMissiles.length === 0 && launchSite.mode === LaunchSiteMode.DEFENCE) ||
        // Threats ahead, switch to defence
        (threateningMissiles.length > 0 && launchSite.mode === LaunchSiteMode.ATTACK)
      ) {
        if (!launchSite.modeChangeTimestamp) {
          launchSite.modeChangeTimestamp = worldState.timestamp;
        }
        continue;
      }

      // Find closest enemy missile
      const sortedMissiles = sortByDistance(
        threateningMissiles.map((missile) => ({
          ...missile,
          isCity: false,
        })),
        launchSite.position,
      );

      const missiles = worldState.missiles.filter((missile) => missile.stateId === state.id);
      const interceptors = worldState.interceptors.filter((interceptor) => interceptor.stateId === state.id);
      const freeInterceptors = interceptors.filter(
        (interceptor) => !interceptor.targetMissileId && launchSite.id === interceptor.launchSiteId,
      );

      const interceptorLaunchCounts = countInterceptors(interceptors, sortedMissiles).filter(
        ([, count]) => count < myLaunchSites.length,
      );

      if (launchSite.mode === LaunchSiteMode.DEFENCE && interceptorLaunchCounts.length > 0) {
        // Defence mode: prioritize intercepting enemy missiles
        const targetMissileId = interceptorLaunchCounts[0][0];
        if (freeInterceptors.length > 0) {
          freeInterceptors[0].targetMissileId = targetMissileId;
        } else {
          launchSite.nextLaunchTarget = { type: 'missile', missileId: targetMissileId };
        }
      } else if (launchSite.mode === LaunchSiteMode.ATTACK) {
        // Attack mode: target enemy cities or launch sites
        const targets = countMissiles(
          sortByDistance([...enemyLaunchSites, ...enemyCities], launchSite.position),
          missiles,
        );

        const target = targets?.[0]?.[0];
        if (target?.position && target?.isCity) {
          // Implement proper targeting here, find non zero population city sector for this target city
          const citySector = findNonZeroPopulationSector(target as City, citySectors);
          launchSite.nextLaunchTarget = {
            type: 'position',
            position: citySector || {
              x: target.position.x + (Math.random() - Math.random()) * CITY_RADIUS,
              y: target.position.y + (Math.random() - Math.random()) * CITY_RADIUS,
            },
          };
        } else {
          launchSite.nextLaunchTarget = target?.position ? { type: 'position', position: target?.position } : undefined;
        }
      }
    }
  }

  return worldState;
}

/**
 * Check if a point is close to a target.
 * @param point The point to check.
 * @param target The target position.
 * @param tolerance The threshold to consider
 * @returns Whether the point is close or not.
 */
function isPointClose(point: Position, target: Position, tolerance: number): boolean {
  return distance(point.x, point.y, target.x, target.y) <= tolerance;
}

/** Sort entities by distance to a position, ascending. */
function sortByDistance<T extends { position: Position; isCity: boolean }>(entities: T[], position: Position): T[] {
  return entities.sort(
    (a, b) =>
      distance(a.position.x, a.position.y, position.x, position.y) -
      distance(b.position.x, b.position.y, position.x, position.y),
  );
}

/** Count how many missiles are targeted towards entity */
function countMissiles<T extends { position: Position; isCity: boolean }>(
  entities: T[],
  missiles: Missile[],
): Array<[T, number]> {
  // Count the missiles that target each entity
  const missileCounts = new Map<T, number>();
  for (const entity of entities) {
    missileCounts.set(
      entity,
      missiles.filter((missile) => isPointClose(missile.target, entity.position, EXPLOSION_RADIUS)).length,
    );
  }

  // Convert the map to a sorted array by missile count ascending
  return Array.from(missileCounts).sort((a, b) => a[1] - b[1]);
}

/** Count how many interceptors are targeted towards missile */
function countInterceptors(interceptors: Interceptor[], missiles: Missile[]): Array<[MissileId, number]> {
  // Count the missiles that target each entity
  const missileCounts = new Map<MissileId, number>();
  for (const missile of missiles) {
    missileCounts.set(missile.id, 0);
  }
  for (const interceptor of interceptors) {
    if (interceptor.targetMissileId) {
      missileCounts.set(interceptor.targetMissileId, (missileCounts.get(interceptor.targetMissileId) ?? 0) + 1);
    }
  }

  // Convert the map to a sorted array by missile count ascending
  return Array.from(missileCounts).sort((a, b) => a[1] - b[1]);
}

/**
 * Find a non-zero population sector within a target city.
 * @param target The target city.
 * @param worldState The current world state.
 * @returns A position within the city that has a non-zero population.
 */
function findNonZeroPopulationSector(target: City, citySectors: Sector[]): Position | null {
  // This function assumes that each city has sectors and we can access their population.
  // Adjust based on your actual data structure.
  const sectors = citySectors.filter((sector) => sector.cityId === target.id);

  // If there are no sectors with population, return null
  if (!sectors || sectors.length === 0) {
    return null;
  }

  // Select a random sector with non-zero population
  const selectedSector = sectors[Math.floor(Math.random() * sectors.length)];
  return selectedSector.position;
}
