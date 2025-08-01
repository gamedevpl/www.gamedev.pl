/**
 * Contains the logic for the ecosystem auto-balancer.
 */

import {
  ECOSYSTEM_BALANCER_TARGET_BUSH_COUNT,
  ECOSYSTEM_BALANCER_TARGET_PREDATOR_POPULATION,
  ECOSYSTEM_BALANCER_TARGET_PREY_POPULATION,
  MAX_BERRY_BUSH_SPREAD_CHANCE,
  MAX_PREDATOR_GESTATION_PERIOD,
  MAX_PREDATOR_HUNGER_INCREASE_PER_HOUR,
  MAX_PREDATOR_PROCREATION_COOLDOWN,
  MAX_PREY_GESTATION_PERIOD,
  MAX_PREY_HUNGER_INCREASE_PER_HOUR,
  MAX_PREY_PROCREATION_COOLDOWN,
  MIN_BERRY_BUSH_SPREAD_CHANCE,
  MIN_PREDATOR_GESTATION_PERIOD,
  MIN_PREDATOR_HUNGER_INCREASE_PER_HOUR,
  MIN_PREDATOR_PROCREATION_COOLDOWN,
  MIN_PREY_GESTATION_PERIOD,
  MIN_PREY_HUNGER_INCREASE_PER_HOUR,
  MIN_PREY_PROCREATION_COOLDOWN,
} from '../world-consts';
import { IndexedWorldState } from '../world-index/world-index-types';
import { GameWorldState } from '../world-types';

function calculateDynamicParameter(
  currentPopulation: number,
  targetPopulation: number,
  minParam: number,
  maxParam: number,
): number {
  const populationRatio = Math.min(Math.max(currentPopulation / targetPopulation, 0), 2); // Clamp between 0 and 2 to avoid extreme values
  const parameter = minParam + (maxParam - minParam) * populationRatio;
  return parameter;
}

export function updateEcosystemBalancer(gameState: GameWorldState): void {
  const preyCount = (gameState as IndexedWorldState).search.prey.count();
  const predatorCount = (gameState as IndexedWorldState).search.predator.count();
  const bushCount = (gameState as IndexedWorldState).search.berryBush.count();

  // Update prey parameters
  gameState.ecosystem.preyGestationPeriod = calculateDynamicParameter(
    preyCount,
    ECOSYSTEM_BALANCER_TARGET_PREY_POPULATION,
    MIN_PREY_GESTATION_PERIOD,
    MAX_PREY_GESTATION_PERIOD,
  );
  gameState.ecosystem.preyProcreationCooldown = calculateDynamicParameter(
    preyCount,
    ECOSYSTEM_BALANCER_TARGET_PREY_POPULATION,
    MIN_PREY_PROCREATION_COOLDOWN,
    MAX_PREY_PROCREATION_COOLDOWN,
  );
  gameState.ecosystem.preyHungerIncreasePerHour = calculateDynamicParameter(
    preyCount,
    ECOSYSTEM_BALANCER_TARGET_PREY_POPULATION,
    MIN_PREY_HUNGER_INCREASE_PER_HOUR,
    MAX_PREY_HUNGER_INCREASE_PER_HOUR,
  );

  // Update predator parameters
  gameState.ecosystem.predatorGestationPeriod = calculateDynamicParameter(
    predatorCount,
    ECOSYSTEM_BALANCER_TARGET_PREDATOR_POPULATION,
    MIN_PREDATOR_GESTATION_PERIOD,
    MAX_PREDATOR_GESTATION_PERIOD,
  );
  gameState.ecosystem.predatorProcreationCooldown = calculateDynamicParameter(
    predatorCount,
    ECOSYSTEM_BALANCER_TARGET_PREDATOR_POPULATION,
    MIN_PREDATOR_PROCREATION_COOLDOWN,
    MAX_PREDATOR_PROCREATION_COOLDOWN,
  );
  gameState.ecosystem.predatorHungerIncreasePerHour = calculateDynamicParameter(
    predatorCount,
    ECOSYSTEM_BALANCER_TARGET_PREDATOR_POPULATION,
    MIN_PREDATOR_HUNGER_INCREASE_PER_HOUR,
    MAX_PREDATOR_HUNGER_INCREASE_PER_HOUR,
  );

  // Update bush parameters (inverted: more bushes = lower spread chance)
  gameState.ecosystem.berryBushSpreadChance = calculateDynamicParameter(
    bushCount,
    ECOSYSTEM_BALANCER_TARGET_BUSH_COUNT,
    MAX_BERRY_BUSH_SPREAD_CHANCE, // Swapped min/max
    MIN_BERRY_BUSH_SPREAD_CHANCE, // to invert the result
  );
}
