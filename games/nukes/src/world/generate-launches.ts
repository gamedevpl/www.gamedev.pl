// prompt: 2940295303300907008

import { WorldState, Missile, Explosion, Position } from './world-state-types';
import { distance } from '../math/position-utils';
import { EXPLOSION_DURATION, EXPLOSION_RADIUS, MISSILE_SPEED } from './world-state-constants';

/**
 * Plan launches for each state to eliminate other states' populations,
 * considering existing missiles and future explosions.
 *
 * @param state The current world state.
 * @returns A list of new missiles and their corresponding explosions.
 */
export function generateLaunches(state: WorldState): {
  missiles: Missile[];
  explosions: Explosion[];
} {
  const newMissiles: Missile[] = [];
  const newExplosions: Explosion[] = [];

  // Iterate through each state to plan their launches.
  for (const currentState of state.states) {
    // Get launch sites belonging to the current state.
    const stateLaunchSites = state.launchSites.filter((launchSite) => launchSite.stateId === currentState.id);

    // Iterate through each launch site of the state.
    for (const launchSite of stateLaunchSites) {
      // Find potential target cities in other states.
      const enemyCities = state.cities.filter((city) => city.stateId !== currentState.id);

      // Prioritize targets: enemy missiles in flight > enemy cities
      const potentialTargets = [
        ...findMissilesInFlight(state, currentState.id), // Higher priority
        ...enemyCities,
      ];

      // Evaluate potential targets and launch a missile if possible.
      let targetFound = false;
      for (const target of potentialTargets) {
        if (targetFound) {
          break; // Only launch one missile per launch site
        }

        const launchPosition = launchSite.position;
        let targetPosition;
        if ('launch' in target) {
          // Targeting a missile in flight
          // Calculate the missile's position at the estimated time of impact.
          const flightTime =
            distance(launchPosition.x, launchPosition.y, target.target.x, target.target.y) / MISSILE_SPEED;
          targetPosition = estimateTargetPosition(target, flightTime);
        } else {
          // Targeting a city
          targetPosition = target.position;
        }

        const flightDuration =
          distance(launchPosition.x, launchPosition.y, targetPosition.x, targetPosition.y) / MISSILE_SPEED;

        // Check if the target is reachable and the area is safe.
        if (
          isTargetReachable(state, launchPosition, targetPosition, flightDuration) &&
          isLaunchSafe(state, launchPosition, targetPosition, flightDuration)
        ) {
          const missileId = `missile-${Date.now()}-${Math.random()}`; // Generate a unique ID
          const launchTimestamp = state.timestamp;
          const targetTimestamp = state.timestamp + flightDuration;

          // Create new missile.
          const newMissile: Missile = {
            id: missileId,
            launch: launchPosition,
            launchTimestamp,
            target: targetPosition,
            targetTimestamp,
          };
          newMissiles.push(newMissile);

          // Create corresponding explosion.
          const newExplosion: Explosion = {
            id: `explosion-${Date.now()}-${Math.random()}`, // Generate a unique ID
            missileId: missileId, // Associate explosion with missile
            startTimestamp: targetTimestamp,
            endTimestamp: targetTimestamp + EXPLOSION_DURATION,
            position: targetPosition,
            radius: EXPLOSION_RADIUS,
          };
          newExplosions.push(newExplosion);

          targetFound = true; // Mark target as found to launch only one missile
        }
      }
    }
  }

  return { missiles: newMissiles, explosions: newExplosions };
}

/**
 * Estimates the future position of a missile in flight.
 *
 * @param missile The missile to track
 * @param flightTimeRemaining The remaining flight time of the missile
 * @returns The estimated position of the missile after the remaining flight time
 */
function estimateTargetPosition(missile: Missile, flightTimeRemaining: number): Position {
  const distanceRatio = flightTimeRemaining / (missile.targetTimestamp - missile.launchTimestamp);
  const x = missile.launch.x + (missile.target.x - missile.launch.x) * distanceRatio;
  const y = missile.launch.y + (missile.target.y - missile.launch.y) * distanceRatio;
  return { x, y };
}

/**
 * Checks if a launch is safe by considering existing explosions.
 *
 * @param state The current world state.
 * @param launchPosition The launch position of the missile.
 * @param targetPosition The target position of the missile.
 * @param flightDuration The flight duration of the missile.
 * @returns True if the launch is safe, false otherwise.
 */
function isLaunchSafe(
  state: WorldState,
  launchPosition: Position,
  targetPosition: Position,
  flightDuration: number,
): boolean {
  // Check if the launch path intersects with any future explosions.
  for (const explosion of state.explosions) {
    // Calculate the distance between the explosion center and the launch/target positions.
    const distanceToLaunch = distance(explosion.position.x, explosion.position.y, launchPosition.x, launchPosition.y);
    const distanceToTarget = distance(explosion.position.x, explosion.position.y, targetPosition.x, targetPosition.y);

    // If the missile is in flight during the explosion
    if (state.timestamp + flightDuration > explosion.startTimestamp && state.timestamp < explosion.endTimestamp) {
      // If the distance to the launch or target is within the explosion radius, the launch is not safe.
      if (distanceToLaunch <= explosion.radius || distanceToTarget <= explosion.radius) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Checks if a target is reachable within the simulation time limit.
 *
 * @param state The current world state.
 * @param launchPosition The launch position of the missile.
 * @param targetPosition The target position of the missile.
 * @param flightDuration The flight duration of the missile.
 * @returns True if the target is reachable, false otherwise.
 */
function isTargetReachable(
  state: WorldState,
  launchPosition: Position,
  targetPosition: Position,
  flightDuration: number,
): boolean {
  // Calculate the time it will take for the missile to reach the target.
  const timeToTarget = distance(launchPosition.x, launchPosition.y, targetPosition.x, targetPosition.y) / MISSILE_SPEED;

  // Check if the missile can reach the target before the simulation ends.
  return state.timestamp + timeToTarget <= state.timestamp + flightDuration;
}

/**
 * Finds missiles that are currently in flight and belong to enemy states.
 *
 * @param state The current world state.
 * @param currentStateId The ID of the current state to exclude its own missiles.
 * @returns A list of missiles in flight from enemy states.
 */
function findMissilesInFlight(state: WorldState, currentStateId: string): Missile[] {
  // Find missiles that were launched but haven't reached their target yet
  return state.missiles.filter(
    (missile) =>
      missile.launchTimestamp <= state.timestamp &&
      missile.targetTimestamp >= state.timestamp &&
      !state.launchSites.some(
        (launchSite) =>
          launchSite.position.x === missile.launch.x &&
          launchSite.position.y === missile.launch.y &&
          launchSite.stateId === currentStateId,
      ),
  );
}
