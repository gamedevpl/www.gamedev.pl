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
import { handlePopulationExtinction, emergencyPopulationBoost } from './population-resurrection';

// Global Q-learning agent instance
let globalQLearningAgent: EcosystemQLearningAgent | null = null;

// Track previous population counts for proper reward timing
let lastPreyCount: number | undefined = undefined;
let lastPredatorCount: number | undefined = undefined;
let lastBushCount: number | undefined = undefined;

// Default Q-learning configuration - refined for better ecosystem control
const DEFAULT_Q_LEARNING_CONFIG: QLearningConfig = {
  learningRate: 0.2, // Reduced from 0.3 for more stable learning
  discountFactor: 0.9, // Increased from 0.8 to value long-term stability more
  explorationRate: 0.4, // Reduced from 0.6 for more exploitation
  explorationDecay: 0.995, // Slower decay to maintain some exploration
  minExplorationRate: 0.02, // Lower minimum for better final performance
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
 * Q-learning based ecosystem balancer with safety fallback and population resurrection
 */
function updateEcosystemBalancerQLearning(gameState: GameWorldState): void {
  if (!globalQLearningAgent) {
    globalQLearningAgent = new EcosystemQLearningAgent(DEFAULT_Q_LEARNING_CONFIG);
  }

  const indexedState = gameState as IndexedWorldState;
  const preyCount = indexedState.search.prey.count();
  const predatorCount = indexedState.search.predator.count();
  const bushCount = indexedState.search.berryBush.count();

  // First priority: Handle extinctions with direct population intervention
  const extinctionHandled = handlePopulationExtinction(gameState);
  if (extinctionHandled) {
    // Reset Q-learning state after population intervention
    globalQLearningAgent.reset();
    // Reset population tracking
    lastPreyCount = undefined;
    lastPredatorCount = undefined;
    lastBushCount = undefined;
    return; // Skip parameter adjustments this round to let new populations establish
  }

  // Second priority: Emergency population boosts for critically low populations
  const emergencyBoostApplied = emergencyPopulationBoost(gameState);
  if (emergencyBoostApplied) {
    globalQLearningAgent.reset();
    // Reset population tracking
    lastPreyCount = undefined;
    lastPredatorCount = undefined;
    lastBushCount = undefined;
    return;
  }

  // Calculate population ratios for safety mechanism
  const preyRatio = preyCount / ECOSYSTEM_BALANCER_TARGET_PREY_POPULATION;
  const predatorRatio = predatorCount / ECOSYSTEM_BALANCER_TARGET_PREDATOR_POPULATION;
  const bushRatio = bushCount / ECOSYSTEM_BALANCER_TARGET_BUSH_COUNT;

  // More conservative safety mechanism: only use deterministic balancer at very low levels
  const useSafetyMode = preyRatio < 0.1 || predatorRatio < 0.1 || bushRatio < 0.1;

  if (useSafetyMode) {
    // Use deterministic balancer to stabilize populations
    updateEcosystemBalancerDeterministic(gameState);
    // Don't reset Q-learning state here - let it learn from safety mode transitions
    // But reset population tracking since we're not using Q-learning this round
    lastPreyCount = undefined;
    lastPredatorCount = undefined;
    lastBushCount = undefined;
  } else {
    // Phase 1: If we have previous population counts, update Q-value for previous action
    if (lastPreyCount !== undefined && lastPredatorCount !== undefined && lastBushCount !== undefined) {
      const reward = globalQLearningAgent.calculateReward(indexedState);
      globalQLearningAgent.updateQ(reward, indexedState, gameState.time);
    }

    // Phase 2: Choose and apply action for current state
    globalQLearningAgent.chooseAndApplyAction(indexedState, gameState.ecosystem, gameState.time);

    // Save current counts for next update
    lastPreyCount = preyCount;
    lastPredatorCount = predatorCount;
    lastBushCount = bushCount;
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
  // Reset population tracking
  lastPreyCount = undefined;
  lastPredatorCount = undefined;
  lastBushCount = undefined;
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
