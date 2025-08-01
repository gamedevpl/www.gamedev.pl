/**
 * Contains the logic for the ecosystem auto-balancer using Q-learning RL.
 */

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

// Track safety mode state to prevent getting stuck
let inSafetyMode = false;

// Default Q-learning configuration - refined for better ecosystem control
const DEFAULT_Q_LEARNING_CONFIG: QLearningConfig = {
  learningRate: 0.2, // Reduced from 0.3 for more stable learning
  discountFactor: 0.9, // Increased from 0.8 to value long-term stability more
  explorationRate: 0.4, // Reduced from 0.6 for more exploitation
  explorationDecay: 0.995, // Slower decay to maintain some exploration
  minExplorationRate: 0.02, // Lower minimum for better final performance
};

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

/**
 * Main ecosystem balancer function - uses Q-learning by default
 */
export function updateEcosystemBalancer(gameState: GameWorldState): void {
  if (!gameState.ecosystem.lastUpdateTime) {
    gameState.ecosystem.lastUpdateTime = 0; // Initialize if not set
  }
  if (gameState.time - gameState.ecosystem.lastUpdateTime < 5) {
    return;
  }

  gameState.ecosystem.lastUpdateTime = gameState.time;
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
  // Reset safety mode state
  inSafetyMode = false;
}

/**
 * Get Q-learning agent statistics for debugging
 */
export function getEcosystemBalancerStats(): {
  qTableSize: number;
  explorationRate: number;
  inSafetyMode: boolean;
} | null {
  if (!globalQLearningAgent) {
    return null;
  }

  return {
    qTableSize: globalQLearningAgent.getQTableSize(),
    explorationRate: globalQLearningAgent.config.explorationRate,
    inSafetyMode,
  };
}

/**
 * Export Q-learning data for persistence
 */
export function exportEcosystemBalancerData() {
  if (!globalQLearningAgent) {
    return null;
  }
  return globalQLearningAgent.exportQTable();
}

/**
 * Import Q-learning data from persistence
 */
export function importEcosystemBalancerData(data: {
  qTable: Record<string, Record<string, number>>;
  config: QLearningConfig;
}): void {
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
