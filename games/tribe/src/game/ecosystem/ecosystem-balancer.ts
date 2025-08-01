/**
 * Contains the logic for the ecosystem auto-balancer.
 */

import {
  ECOSYSTEM_BALANCER_TARGET_PREDATOR_POPULATION,
  ECOSYSTEM_BALANCER_TARGET_PREY_POPULATION,
  MAX_PREDATOR_GESTATION_PERIOD,
  MAX_PREDATOR_PROCREATION_COOLDOWN,
  MAX_PREY_GESTATION_PERIOD,
  MAX_PREY_PROCREATION_COOLDOWN,
  MIN_PREDATOR_GESTATION_PERIOD,
  MIN_PREDATOR_PROCREATION_COOLDOWN,
  MIN_PREY_GESTATION_PERIOD,
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
}
