import { Position, WorldState } from './world-state-types';
import { distance } from '../math/position-utils';
import { Missile } from './world-state-types'; /* Import Missile to be able to define new missiles. */
import { EXPLOSION_RADIUS, MISSILE_SPEED } from './world-state-constants';
/* Add necessary imports here if needed */

/**
 * Plan launches for each state to eliminate other states' populations,
 * considering existing missiles and future explosions.
 *
 * @param state The current world state.
 * @returns A list of new missiles and their corresponding explosions.
 */
export function generateLaunches(worldState: WorldState): WorldState {
  for (const state of worldState.states.filter((state) => !state.isPlayerControlled)) {
    const myCities = worldState.cities.filter((city) => city.stateId === state.id);
    const enemyCities = worldState.cities.filter(
      (city) => city.stateId !== state.id && city.populationHistogram.slice(-1)[0].population > 0,
    );
    const enemyMissiles = worldState.missiles.filter((missile) => missile.stateId !== state.id);

    // Filter enemy missiles, keep only those which are approaching any of myCities
    const threateningMissiles = enemyMissiles.filter((missile) => {
      return myCities.some((city) => {
        return isPointClose(missile.target, city.position);
      });
    });

    for (const launchSite of worldState.launchSites.filter((launchSite) => launchSite.stateId === state.id)) {
      if (launchSite.nextLaunchTarget) {
        continue;
      } else if (enemyCities.length === 0) {
        break;
      }

      // Find closest enemy missile
      const closestMissile = findClosest(
        threateningMissiles.map((missile) => ({
          ...missile,
          position: calculateMissilePosition(missile, worldState.timestamp),
          interceptionPoint: calculateInterceptionPoint(missile, launchSite.position, worldState.timestamp),
        })),
        launchSite.position,
      );

      // Instead of poping enemy city from the list, get the one which is closest to the launch site
      const closestCity = findClosest(enemyCities, launchSite.position);

      // Set launchSite.nextLaunchTarget to enemy missile, or to enemy city if there is no missile
      launchSite.nextLaunchTarget =
        (closestMissile ? closestMissile.interceptionPoint : closestCity?.position) ?? undefined;
    }
  }

  return worldState;
}

// Calculate the current position of the missile based on its launch and target positions, and the elapsed time
function calculateMissilePosition(missile: Missile, currentTimestamp: number): Position {
  const progress = (currentTimestamp - missile.launchTimestamp) / (missile.targetTimestamp - missile.launchTimestamp);
  return {
    x: missile.launch.x + (missile.target.x - missile.launch.x) * progress,
    y: missile.launch.y + (missile.target.y - missile.launch.y) * progress,
  };
}

/**
 * Calculate the interception point for a missile.
 * @param missile The missile to intercept.
 * @param launchSite The launch site position.
 * @param worldTimestamp The current world timestamp.
 * @returns The interception point position.
 */
function calculateInterceptionPoint(missile: Missile, sitePosition: Position, worldTimestamp: number): Position | null {
  const missilePosition = calculateMissilePosition(missile, worldTimestamp);
  const distToLaunchSite = distance(missilePosition.x, missilePosition.y, sitePosition.x, sitePosition.y);
  if (distToLaunchSite < EXPLOSION_RADIUS) {
    // Ensure interception point is not within explosion radius to launch site
    return null;
  }

  // Take target position, and move towards missile position by EXPLOSION_RADIUS distance
  const dist = distance(missile.target.x, missile.target.y, missile.launch.x, missile.launch.y);
  const dx = (missile.target.x - missile.launch.x) / dist;
  const dy = (missile.target.y - missile.launch.y) / dist;

  const interceptionPoint = {
    x: missile.target.x - dx * EXPLOSION_RADIUS,
    y: missile.target.y - dy * EXPLOSION_RADIUS,
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
  const tolerance = 5; // Define a closeness tolerance
  return distance(point.x, point.y, target.x, target.y) <= tolerance;
}

/**
 * Find the closest entity to a position.
 * @param entities The entities to search from.
 * @param position The reference position.
 * @returns The closest entity or undefined if none.
 */
function findClosest<T extends { position: Position }>(entities: T[], position: Position): T | null {
  let closestEntity = null;
  let minDist = Infinity;
  for (const entity of entities) {
    const dist = distance(position.x, position.y, entity.position.x, entity.position.y);
    if (dist < minDist) {
      minDist = dist;
      closestEntity = entity;
    }
  }
  return closestEntity;
}
