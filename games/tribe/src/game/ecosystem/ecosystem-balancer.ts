/**
 * Contains the logic for the ecosystem auto-balancer using Q-learning RL.
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
import { EcosystemQLearningAgent, QLearningConfig } from './q-learning-agent';

// Global Q-learning agent instance
let globalQLearningAgent: EcosystemQLearningAgent | null = null;

// Default Q-learning configuration
const DEFAULT_Q_LEARNING_CONFIG: QLearningConfig = {
  learningRate: 0.3, // Increased for faster learning
  discountFactor: 0.8, // Reduced to focus more on immediate rewards
  explorationRate: 0.6, // Increased initial exploration
  explorationDecay: 0.99, // Slower decay
  minExplorationRate: 0.05, // Higher minimum exploration
};

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

/**
 * Fallback deterministic balancer - used when Q-learning is disabled or as a baseline
 */
export function updateEcosystemBalancerDeterministic(gameState: GameWorldState): void {
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

/**
 * Q-learning based ecosystem balancer with safety fallback
 */
function updateEcosystemBalancerQLearning(gameState: GameWorldState): void {
  if (!globalQLearningAgent) {
    globalQLearningAgent = new EcosystemQLearningAgent(DEFAULT_Q_LEARNING_CONFIG);
  }

  const preyCount = (gameState as IndexedWorldState).search.prey.count();
  const predatorCount = (gameState as IndexedWorldState).search.predator.count();
  const bushCount = (gameState as IndexedWorldState).search.berryBush.count();

  // Safety mechanism: use deterministic balancer when populations are critically low
  const preyRatio = preyCount / ECOSYSTEM_BALANCER_TARGET_PREY_POPULATION;
  const predatorRatio = predatorCount / ECOSYSTEM_BALANCER_TARGET_PREDATOR_POPULATION;
  const bushRatio = bushCount / ECOSYSTEM_BALANCER_TARGET_BUSH_COUNT;

  const useSafetyMode = preyRatio < 0.15 || predatorRatio < 0.15 || bushRatio < 0.15;

  if (useSafetyMode) {
    // Use deterministic balancer to prevent collapse
    updateEcosystemBalancerDeterministic(gameState);
    // Reset Q-learning state to start fresh after recovery
    globalQLearningAgent.reset();
  } else {
    // Use Q-learning for normal operation
    globalQLearningAgent.act(preyCount, predatorCount, bushCount, gameState.ecosystem);
  }
}

/**
 * Main ecosystem balancer function - uses Q-learning by default
 */
export function updateEcosystemBalancer(gameState: GameWorldState): void {
  // Use Q-learning balancer
  updateEcosystemBalancerQLearning(gameState);
}

/**
 * Reset the Q-learning agent (useful for tests)
 */
export function resetEcosystemBalancer(): void {
  if (globalQLearningAgent) {
    globalQLearningAgent.reset();
  }
}

/**
 * Get Q-learning agent statistics for debugging
 */
export function getEcosystemBalancerStats(): { qTableSize: number; explorationRate: number } | null {
  if (!globalQLearningAgent) {
    return null;
  }
  
  return {
    qTableSize: globalQLearningAgent.getQTableSize(),
    explorationRate: (globalQLearningAgent as any).config.explorationRate,
  };
}

/**
 * Export Q-learning data for persistence
 */
export function exportEcosystemBalancerData(): any {
  if (!globalQLearningAgent) {
    return null;
  }
  return globalQLearningAgent.exportQTable();
}

/**
 * Import Q-learning data from persistence
 */
export function importEcosystemBalancerData(data: any): void {
  if (!globalQLearningAgent) {
    globalQLearningAgent = new EcosystemQLearningAgent(DEFAULT_Q_LEARNING_CONFIG);
  }
  globalQLearningAgent.importQTable(data);
}

/**
 * Switch to deterministic balancer (for comparison/debugging)
 */
export function useDeterministicBalancer(): void {
  globalQLearningAgent = null;
}

/**
 * Check if Q-learning is enabled
 */
export function isQLearningEnabled(): boolean {
  return globalQLearningAgent !== null;
}
