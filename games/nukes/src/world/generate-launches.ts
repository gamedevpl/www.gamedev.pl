// prompt: 2940295303300907008

import { WorldState, Missile, Explosion } from './world-state-types';
import { distance } from '../math/position-utils';
import {
  EXPLOSION_DAMAGE_RATIO,
  EXPLOSION_DURATION,
  EXPLOSION_RADIUS,
  MIN_EXPLOSION_DAMAGE,
  MISSILE_SPEED,
} from './world-state-constants';

/**
 * For each state, determine launch targets and generate missile and explosion events.
 *
 * This function aims to strategically target cities to maximize damage to enemy states,
 * taking into account existing missiles and future explosions to optimize target distribution.
 *
 * @param state Current world state
 * @returns A tuple containing two arrays: new missiles and their corresponding explosions
 */
export function generateLaunches(state: WorldState) {
  const newMissiles: Missile[] = [];
  const newExplosions: Explosion[] = [];

  // Iterate through states to plan launches for each state's launch sites
  for (const currentState of state.states) {
    // Get launch sites belonging to the current state
    const stateLaunchSites = state.launchSites.filter((launchSite) => launchSite.stateId === currentState.id);

    // For each launch site, determine and execute a launch
    for (const launchSite of stateLaunchSites) {
      // Find potential target cities in other states
      const potentialTargets = state.cities.filter((city) => city.stateId !== currentState.id);

      // Rank potential targets based on strategic value
      const rankedTargets = rankTargets(state, launchSite.position, potentialTargets);

      // If there are any valid targets
      if (rankedTargets.length > 0) {
        const targetCity = rankedTargets[0]; // Choose the highest-ranked target

        // Calculate missile flight time
        const distanceToTarget = distance(
          launchSite.position.x,
          launchSite.position.y,
          targetCity.position.x,
          targetCity.position.y,
        );
        const missileFlightTime = distanceToTarget / MISSILE_SPEED;

        // Create new missile
        const newMissile: Missile = {
          id: `missile-${Math.random().toString(36).substring(2, 15)}`, // Generate a unique ID
          launch: launchSite.position,
          launchTimestamp: state.timestamp,
          target: targetCity.position,
          targetTimestamp: state.timestamp + missileFlightTime,
        };
        newMissiles.push(newMissile);

        // Create corresponding explosion
        const newExplosion: Explosion = {
          id: `explosion-${Math.random().toString(36).substring(2, 15)}`, // Generate a unique ID
          startTimestamp: state.timestamp + missileFlightTime,
          endTimestamp: state.timestamp + missileFlightTime + EXPLOSION_DURATION,
          position: targetCity.position,
          radius: EXPLOSION_RADIUS,
        };
        newExplosions.push(newExplosion);
      }
    }
  }

  return { explosions: newExplosions, missiles: newMissiles };
}

/**
 * Rank potential target cities based on strategic value.
 *
 * This function considers factors like remaining population, proximity to other targets,
 * and existing missile/explosion activity to prioritize targets that maximize damage.
 *
 * @param state Current world state
 * @param launchPosition Position of the launching entity
 * @param potentialTargets Array of potential target cities
 * @returns Sorted array of target cities in descending order of strategic value
 */
function rankTargets(
  state: WorldState,
  _launchPosition: { x: number; y: number },
  potentialTargets: {
    id: string;
    stateId: string;
    name: string;
    position: { x: number; y: number };
    populationHistogram: { timestamp: number; population: number }[];
  }[],
): {
  id: string;
  stateId: string;
  name: string;
  position: { x: number; y: number };
  populationHistogram: { timestamp: number; population: number }[];
}[] {
  return potentialTargets
    .map((target) => {
      // Calculate remaining population after considering future explosions
      const futurePopulation = calculateFuturePopulation(state, target);

      // Prioritize targets with higher remaining population
      return {
        ...target,
        futurePopulation,
        value: futurePopulation * target.populationHistogram.length,
      };
    })
    .sort((a, b) => b.value - a.value); // Sort by value in descending order
}

/**
 * Calculate the future population of a city after accounting for upcoming explosions.
 *
 * This function iterates through future explosions and estimates the population reduction
 * based on the explosion's damage radius and the city's distance from the epicenter.
 *
 * @param state Current world state
 * @param city Target city for population calculation
 * @returns Estimated future population of the city
 */
function calculateFuturePopulation(
  state: WorldState,
  city: {
    id: string;
    stateId: string;
    name: string;
    position: { x: number; y: number };
    populationHistogram: { timestamp: number; population: number }[];
  },
): number {
  let futurePopulation = city.populationHistogram[city.populationHistogram.length - 1].population;

  // Consider future explosions
  for (const explosion of state.explosions.filter((e) => e.startTimestamp >= state.timestamp)) {
    const distanceToExplosion = distance(city.position.x, city.position.y, explosion.position.x, explosion.position.y);

    // If within explosion radius, calculate population reduction
    if (distanceToExplosion <= explosion.radius) {
      const damage = Math.max(MIN_EXPLOSION_DAMAGE, futurePopulation * EXPLOSION_DAMAGE_RATIO);
      futurePopulation -= damage;
    }
  }

  return Math.max(0, futurePopulation); // Ensure population doesn't go negative
}
