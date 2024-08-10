import { Position, WorldState, Strategy } from './world-state-types';
import { distance } from '../math/position-utils';
import { Missile } from './world-state-types';
import { EXPLOSION_RADIUS, MISSILE_SPEED } from './world-state-constants';

/**
 * Plan launches for each state to eliminate other states' populations,
 * considering existing missiles and future explosions.
 *
 * @param state The current world state.
 * @returns A list of new missiles and their corresponding explosions.
 */
export function generateLaunches(worldState: WorldState): WorldState {
  for (const state of worldState.states) {
    const myCities = worldState.cities.filter((city) => city.stateId === state.id);
    const myLaunchSites = worldState.launchSites.filter((launchSite) => launchSite.stateId === state.id);

    const enemyCities = worldState.cities.filter(
      (city) => state.strategies[city.stateId] === Strategy.HOSTILE && city.stateId !== state.id && city.population > 0,
    );
    const enemyMissiles = worldState.missiles.filter(
      (missile) => state.strategies[missile.stateId] !== Strategy.FRIENDLY && missile.stateId !== state.id,
    );
    const enemyLaunchSites = worldState.launchSites.filter(
      (launchSite) => state.strategies[launchSite.stateId] === Strategy.HOSTILE && launchSite.stateId !== state.id,
    );

    // Filter enemy missiles, keep only those which are approaching any of myCities or myLaunchSites
    const threateningMissiles = enemyMissiles
      .filter((missile) => {
        return (
          myCities.some((city) => {
            return isPointClose(missile.target, city.position);
          }) ||
          myLaunchSites.some((launchSite) => {
            return isPointClose(missile.target, launchSite.position);
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

      // Find closest enemy missile
      const sortedMissiles = sortByDistance(
        threateningMissiles.map((missile) => ({
          ...missile,
          interceptionPoint: calculateInterceptionPoint(missile, launchSite.position),
        })),
        launchSite.position,
      );

      const missiles = worldState.missiles.filter((missile) => missile.stateId === state.id);

      const missileLaunchCounts = countMissiles(sortedMissiles, missiles).filter(
        ([, count]) => count < myLaunchSites.length,
      );

      if (missileLaunchCounts.length > 0) {
        // missiles are highest priority targets
        launchSite.nextLaunchTarget = missileLaunchCounts[0][0].interceptionPoint ?? undefined;
      } else {
        const targets = countMissiles(
          sortByDistance([...enemyLaunchSites, ...enemyCities], launchSite.position),
          missiles,
        );

        launchSite.nextLaunchTarget = targets?.[0]?.[0]?.position ?? undefined;
      }
    }
  }

  return worldState;
}

/**
 * Calculate the interception point for a missile.
 * @param missile The missile to intercept.
 * @param launchSite The launch site position.
 * @param worldTimestamp The current world timestamp.
 * @returns The interception point position.
 */
function calculateInterceptionPoint(missile: Missile, sitePosition: Position): Position | null {
  const distToLaunchSite = distance(missile.position.x, missile.position.y, sitePosition.x, sitePosition.y);
  if (distToLaunchSite < EXPLOSION_RADIUS) {
    // Ensure interception point is not within explosion radius to launch site
    return null;
  }

  // Take target position, and move towards missile position by EXPLOSION_RADIUS distance
  const dist = distance(missile.target.x, missile.target.y, missile.launch.x, missile.launch.y);
  const dx = (missile.target.x - missile.launch.x) / dist;
  const dy = (missile.target.y - missile.launch.y) / dist;

  const interceptionPoint = {
    x: missile.target.x - dx * EXPLOSION_RADIUS * 2,
    y: missile.target.y - dy * EXPLOSION_RADIUS * 2,
  };

  // Calculate how much time it will take the missile to reach the interception point
  const timeToIntercept = distToLaunchSite / MISSILE_SPEED;
  // Given MISSILE_SPEED and the distance from launch site to interception point calculate how much time it will take to reach the interception point for new missile launched from launch site.
  const newMissileTravelTime =
    distance(sitePosition.x, sitePosition.y, interceptionPoint.x, interceptionPoint.y) / MISSILE_SPEED;
  // Return null if it is too early or too late to launch the missile in order to destroy the enemy missile
  if (timeToIntercept < newMissileTravelTime || timeToIntercept > newMissileTravelTime + 10) {
    // 10 seconds tolerance
    return null;
  }
  return interceptionPoint;
}

/**
 * Check if a point is close to a target.
 * @param point The point to check.
 * @param target The target position.
 * @returns Whether the point is close or not.
 */
function isPointClose(point: Position, target: Position): boolean {
  const tolerance = EXPLOSION_RADIUS; // Define a closeness tolerance
  return distance(point.x, point.y, target.x, target.y) <= tolerance;
}

/** Sort entities by distance to a position, ascending. */
function sortByDistance<T extends { position: Position }>(entities: T[], position: Position): T[] {
  return entities.sort(
    (a, b) =>
      distance(a.position.x, a.position.y, position.x, position.y) -
      distance(b.position.x, b.position.y, position.x, position.y),
  );
}

/** Count how many missiles are targeted towards entity */
function countMissiles<T extends { position: Position }>(entities: T[], missiles: Missile[]): Array<[T, number]> {
  // Count the missiles that target each entity
  const missileCounts = new Map<T, number>();
  for (const entity of entities) {
    missileCounts.set(entity, missiles.filter((missile) => isPointClose(missile.target, entity.position)).length);
  }

  // Convert the map to a sorted array by missile count ascending
  return Array.from(missileCounts).sort((a, b) => a[1] - b[1]);
}
