/**
 * Contains the logic for the ecosystem auto-balancer using Q-learning RL.
 */

import { GameWorldState } from '../world-types';
import { handlePopulationExtinction, emergencyPopulationBoost } from './population-resurrection';

const ECOSYSTEM_BALANCER_INTERVAL = 5; // TODO: fine tune this value

/**
 * Q-learning based ecosystem balancer with safety fallback and population resurrection
 */
function updateEcosystemBalancerQLearning(gameState: GameWorldState): void {
  handlePopulationExtinction(gameState);
  emergencyPopulationBoost(gameState);

  // TODO: Implement Q-learning logic (in a separate file)
}

/**
 * Main ecosystem balancer function - uses Q-learning by default
 */
export function updateEcosystemBalancer(gameState: GameWorldState): void {
  if (!gameState.ecosystem.lastUpdateTime) {
    gameState.ecosystem.lastUpdateTime = 0; // Initialize if not set
  }
  if (gameState.time - gameState.ecosystem.lastUpdateTime < ECOSYSTEM_BALANCER_INTERVAL) {
    return;
  }

  gameState.ecosystem.lastUpdateTime = gameState.time;
  // Use Q-learning balancer
  updateEcosystemBalancerQLearning(gameState);
}

/**
 * Reset the Q-learning agent (useful for tests)
 */
export function resetEcosystemBalancer(): void {}

/**
 * Get Q-learning agent statistics for debugging
 */
export function getEcosystemBalancerStats(): {
  qTableSize: number;
  explorationRate: number;
} | null {
  return {
    qTableSize: 0,
    explorationRate: 0,
  };
}
