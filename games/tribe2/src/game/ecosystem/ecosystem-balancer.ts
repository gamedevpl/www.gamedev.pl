/**
 * Contains the logic for the ecosystem auto-balancer using Q-learning RL.
 */

import { GameWorldState } from '../world-types';
import { handlePopulationExtinction, emergencyPopulationBoost } from './population-resurrection';
import { IndexedWorldState } from '../world-index/world-index-types';
import {
  ECOSYSTEM_BALANCER_TARGET_PREY_POPULATION,
  ECOSYSTEM_BALANCER_TARGET_PREDATOR_POPULATION,
  ECOSYSTEM_BALANCER_TARGET_BUSH_COUNT,
} from '../game-consts.ts';
import {
  MIN_PREY_GESTATION_PERIOD,
  MAX_PREY_GESTATION_PERIOD,
  MIN_PREY_PROCREATION_COOLDOWN,
  MAX_PREY_PROCREATION_COOLDOWN,
  MIN_PREDATOR_GESTATION_PERIOD,
  MAX_PREDATOR_GESTATION_PERIOD,
  MIN_PREDATOR_PROCREATION_COOLDOWN,
  MAX_PREDATOR_PROCREATION_COOLDOWN,
  MIN_PREY_HUNGER_INCREASE_PER_HOUR,
  MAX_PREY_HUNGER_INCREASE_PER_HOUR,
  MIN_PREDATOR_HUNGER_INCREASE_PER_HOUR,
  MAX_PREDATOR_HUNGER_INCREASE_PER_HOUR,
} from '../animal-consts.ts';
import {
  MIN_BERRY_BUSH_SPREAD_CHANCE,
  MAX_BERRY_BUSH_SPREAD_CHANCE,
} from '../entities/plants/berry-bush/berry-bush-consts.ts';

const ECOSYSTEM_BALANCER_INTERVAL = 1; // More frequent updates for better control

// Q-learning hyperparameters
const ALPHA = 0.3; // Learning rate - higher for faster learning
const GAMMA = 0.8; // Discount factor - slightly lower for more immediate focus
const INITIAL_EPSILON = 0.8; // Initial exploration rate - balanced exploration
const EPSILON_DECAY = 0.99; // Epsilon decay rate - slower decay for more exploration
const MIN_EPSILON = 0.05; // Minimum exploration rate - keep some exploration

// Action definitions
enum QLearningAction {
  // Prey actions
  INCREASE_PREY_GESTATION = 0,
  DECREASE_PREY_GESTATION = 1,
  INCREASE_PREY_PROCREATION_COOLDOWN = 2,
  DECREASE_PREY_PROCREATION_COOLDOWN = 3,
  INCREASE_PREY_HUNGER = 4,
  DECREASE_PREY_HUNGER = 5,

  // Predator actions
  INCREASE_PREDATOR_GESTATION = 6,
  DECREASE_PREDATOR_GESTATION = 7,
  INCREASE_PREDATOR_PROCREATION_COOLDOWN = 8,
  DECREASE_PREDATOR_PROCREATION_COOLDOWN = 9,
  INCREASE_PREDATOR_HUNGER = 10,
  DECREASE_PREDATOR_HUNGER = 11,

  // Bush actions
  INCREASE_BUSH_SPREAD = 12,
  DECREASE_BUSH_SPREAD = 13,

  // No action
  NO_ACTION = 14,
}

const TOTAL_ACTIONS = Object.keys(QLearningAction).length / 2; // Enum has both number and string keys

// Q-learning agent state
class QLearningAgent {
  private qTable: Map<string, Map<number, number>> = new Map();
  private epsilon: number = INITIAL_EPSILON;
  private lastState: string | null = null;
  private lastAction: number | null = null;

  /**
   * Discretize ecosystem state into bins
   */
  private discretizeState(preyCount: number, predatorCount: number, bushCount: number): string {
    // Discretize prey count into 5 bins
    const preyBin = Math.min(4, Math.floor(preyCount / 25));

    // Discretize predator count into 5 bins
    const predatorBin = Math.min(4, Math.floor(predatorCount / 5));

    // Discretize bush count into 5 bins
    const bushBin = Math.min(4, Math.floor(bushCount / 15));

    return `${preyBin}-${predatorBin}-${bushBin}`;
  }

  /**
   * Get Q-value for state-action pair
   */
  private getQValue(state: string, action: number): number {
    if (!this.qTable.has(state)) {
      this.qTable.set(state, new Map());
    }
    const stateActions = this.qTable.get(state)!;
    return stateActions.get(action) || 0;
  }

  /**
   * Set Q-value for state-action pair
   */
  private setQValue(state: string, action: number, value: number): void {
    if (!this.qTable.has(state)) {
      this.qTable.set(state, new Map());
    }
    this.qTable.get(state)!.set(action, value);
  }

  /**
   * Get best action for a state (exploitation)
   */
  private getBestAction(state: string): number {
    let bestAction = 0;
    let bestValue = this.getQValue(state, 0);

    for (let action = 1; action < TOTAL_ACTIONS; action++) {
      const value = this.getQValue(state, action);
      if (value > bestValue) {
        bestValue = value;
        bestAction = action;
      }
    }

    return bestAction;
  }

  /**
   * Choose action using epsilon-greedy policy
   */
  private chooseAction(state: string): number {
    if (Math.random() < this.epsilon) {
      // Exploration: random action
      return Math.floor(Math.random() * TOTAL_ACTIONS);
    } else {
      // Exploitation: best action
      return this.getBestAction(state);
    }
  }

  /**
   * Apply rule-based corrections for critical population levels
   */
  private applyEmergencyCorrections(
    preyCount: number,
    predatorCount: number,
    bushCount: number,
    gameState: GameWorldState,
  ): void {
    // More aggressive emergency corrections when populations are critically low
    if (preyCount < ECOSYSTEM_BALANCER_TARGET_PREY_POPULATION * 0.5) {
      // Aggressively boost prey reproduction
      gameState.ecosystem.preyGestationPeriod = Math.max(
        MIN_PREY_GESTATION_PERIOD,
        gameState.ecosystem.preyGestationPeriod * 0.8,
      );
      gameState.ecosystem.preyProcreationCooldown = Math.max(
        MIN_PREY_PROCREATION_COOLDOWN,
        gameState.ecosystem.preyProcreationCooldown * 0.8,
      );
      gameState.ecosystem.preyHungerIncreasePerHour = Math.max(
        MIN_PREY_HUNGER_INCREASE_PER_HOUR,
        gameState.ecosystem.preyHungerIncreasePerHour * 0.9,
      );
    }

    if (predatorCount < ECOSYSTEM_BALANCER_TARGET_PREDATOR_POPULATION * 0.6) {
      // Aggressively boost predator reproduction (increased threshold)
      gameState.ecosystem.predatorGestationPeriod = Math.max(
        MIN_PREDATOR_GESTATION_PERIOD,
        gameState.ecosystem.predatorGestationPeriod * 0.75,
      );
      gameState.ecosystem.predatorProcreationCooldown = Math.max(
        MIN_PREDATOR_PROCREATION_COOLDOWN,
        gameState.ecosystem.predatorProcreationCooldown * 0.75,
      );
      gameState.ecosystem.predatorHungerIncreasePerHour = Math.max(
        MIN_PREDATOR_HUNGER_INCREASE_PER_HOUR,
        gameState.ecosystem.predatorHungerIncreasePerHour * 0.85,
      );
    }

    if (bushCount < ECOSYSTEM_BALANCER_TARGET_BUSH_COUNT * 0.5) {
      // Aggressively boost bush spread
      gameState.ecosystem.berryBushSpreadChance = Math.min(
        MAX_BERRY_BUSH_SPREAD_CHANCE,
        gameState.ecosystem.berryBushSpreadChance * 1.2,
      );
    }

    // Control overpopulation - be more aggressive to stay within bounds
    if (preyCount > ECOSYSTEM_BALANCER_TARGET_PREY_POPULATION * 1.4) {
      gameState.ecosystem.preyHungerIncreasePerHour = Math.min(
        MAX_PREY_HUNGER_INCREASE_PER_HOUR,
        gameState.ecosystem.preyHungerIncreasePerHour * 1.05,
      );
    }

    if (predatorCount > ECOSYSTEM_BALANCER_TARGET_PREDATOR_POPULATION * 1.4) {
      gameState.ecosystem.predatorHungerIncreasePerHour = Math.min(
        MAX_PREDATOR_HUNGER_INCREASE_PER_HOUR,
        gameState.ecosystem.predatorHungerIncreasePerHour * 1.05,
      );
    }

    if (bushCount > ECOSYSTEM_BALANCER_TARGET_BUSH_COUNT * 1.4) {
      gameState.ecosystem.berryBushSpreadChance = Math.max(
        MIN_BERRY_BUSH_SPREAD_CHANCE,
        gameState.ecosystem.berryBushSpreadChance * 0.95,
      );
    }
  }
  private calculateReward(preyCount: number, predatorCount: number, bushCount: number): number {
    const preyError = Math.abs(preyCount - ECOSYSTEM_BALANCER_TARGET_PREY_POPULATION);
    const predatorError = Math.abs(predatorCount - ECOSYSTEM_BALANCER_TARGET_PREDATOR_POPULATION);
    const bushError = Math.abs(bushCount - ECOSYSTEM_BALANCER_TARGET_BUSH_COUNT);

    // Scale errors relative to targets for balanced importance
    const normalizedPreyError = preyError / ECOSYSTEM_BALANCER_TARGET_PREY_POPULATION;
    const normalizedPredatorError = predatorError / ECOSYSTEM_BALANCER_TARGET_PREDATOR_POPULATION;
    const normalizedBushError = bushError / ECOSYSTEM_BALANCER_TARGET_BUSH_COUNT;

    // Total normalized error
    const totalNormalizedError = normalizedPreyError + normalizedPredatorError + normalizedBushError;

    // Reward is inversely related to error - higher reward for being closer to targets
    // Use exponential to give much higher reward for being very close
    const reward = 100 * Math.exp(-totalNormalizedError * 2) - 50;

    return reward;
  }

  /**
   * Apply action to game state
   */
  private applyAction(action: number, gameState: GameWorldState): void {
    const stepSize = 0.2; // Larger adjustment for faster learning

    switch (action) {
      case QLearningAction.INCREASE_PREY_GESTATION:
        gameState.ecosystem.preyGestationPeriod = Math.min(
          MAX_PREY_GESTATION_PERIOD,
          gameState.ecosystem.preyGestationPeriod + stepSize * (MAX_PREY_GESTATION_PERIOD - MIN_PREY_GESTATION_PERIOD),
        );
        break;
      case QLearningAction.DECREASE_PREY_GESTATION:
        gameState.ecosystem.preyGestationPeriod = Math.max(
          MIN_PREY_GESTATION_PERIOD,
          gameState.ecosystem.preyGestationPeriod - stepSize * (MAX_PREY_GESTATION_PERIOD - MIN_PREY_GESTATION_PERIOD),
        );
        break;
      case QLearningAction.INCREASE_PREY_PROCREATION_COOLDOWN:
        gameState.ecosystem.preyProcreationCooldown = Math.min(
          MAX_PREY_PROCREATION_COOLDOWN,
          gameState.ecosystem.preyProcreationCooldown +
            stepSize * (MAX_PREY_PROCREATION_COOLDOWN - MIN_PREY_PROCREATION_COOLDOWN),
        );
        break;
      case QLearningAction.DECREASE_PREY_PROCREATION_COOLDOWN:
        gameState.ecosystem.preyProcreationCooldown = Math.max(
          MIN_PREY_PROCREATION_COOLDOWN,
          gameState.ecosystem.preyProcreationCooldown -
            stepSize * (MAX_PREY_PROCREATION_COOLDOWN - MIN_PREY_PROCREATION_COOLDOWN),
        );
        break;
      case QLearningAction.INCREASE_PREY_HUNGER:
        gameState.ecosystem.preyHungerIncreasePerHour = Math.min(
          MAX_PREY_HUNGER_INCREASE_PER_HOUR,
          gameState.ecosystem.preyHungerIncreasePerHour +
            stepSize * (MAX_PREY_HUNGER_INCREASE_PER_HOUR - MIN_PREY_HUNGER_INCREASE_PER_HOUR),
        );
        break;
      case QLearningAction.DECREASE_PREY_HUNGER:
        gameState.ecosystem.preyHungerIncreasePerHour = Math.max(
          MIN_PREY_HUNGER_INCREASE_PER_HOUR,
          gameState.ecosystem.preyHungerIncreasePerHour -
            stepSize * (MAX_PREY_HUNGER_INCREASE_PER_HOUR - MIN_PREY_HUNGER_INCREASE_PER_HOUR),
        );
        break;
      case QLearningAction.INCREASE_PREDATOR_GESTATION:
        gameState.ecosystem.predatorGestationPeriod = Math.min(
          MAX_PREDATOR_GESTATION_PERIOD,
          gameState.ecosystem.predatorGestationPeriod +
            stepSize * (MAX_PREDATOR_GESTATION_PERIOD - MIN_PREDATOR_GESTATION_PERIOD),
        );
        break;
      case QLearningAction.DECREASE_PREDATOR_GESTATION:
        gameState.ecosystem.predatorGestationPeriod = Math.max(
          MIN_PREDATOR_GESTATION_PERIOD,
          gameState.ecosystem.predatorGestationPeriod -
            stepSize * (MAX_PREDATOR_GESTATION_PERIOD - MIN_PREDATOR_GESTATION_PERIOD),
        );
        break;
      case QLearningAction.INCREASE_PREDATOR_PROCREATION_COOLDOWN:
        gameState.ecosystem.predatorProcreationCooldown = Math.min(
          MAX_PREDATOR_PROCREATION_COOLDOWN,
          gameState.ecosystem.predatorProcreationCooldown +
            stepSize * (MAX_PREDATOR_PROCREATION_COOLDOWN - MIN_PREDATOR_PROCREATION_COOLDOWN),
        );
        break;
      case QLearningAction.DECREASE_PREDATOR_PROCREATION_COOLDOWN:
        gameState.ecosystem.predatorProcreationCooldown = Math.max(
          MIN_PREDATOR_PROCREATION_COOLDOWN,
          gameState.ecosystem.predatorProcreationCooldown -
            stepSize * (MAX_PREDATOR_PROCREATION_COOLDOWN - MIN_PREDATOR_PROCREATION_COOLDOWN),
        );
        break;
      case QLearningAction.INCREASE_PREDATOR_HUNGER:
        gameState.ecosystem.predatorHungerIncreasePerHour = Math.min(
          MAX_PREDATOR_HUNGER_INCREASE_PER_HOUR,
          gameState.ecosystem.predatorHungerIncreasePerHour +
            stepSize * (MAX_PREDATOR_HUNGER_INCREASE_PER_HOUR - MIN_PREDATOR_HUNGER_INCREASE_PER_HOUR),
        );
        break;
      case QLearningAction.DECREASE_PREDATOR_HUNGER:
        gameState.ecosystem.predatorHungerIncreasePerHour = Math.max(
          MIN_PREDATOR_HUNGER_INCREASE_PER_HOUR,
          gameState.ecosystem.predatorHungerIncreasePerHour -
            stepSize * (MAX_PREDATOR_HUNGER_INCREASE_PER_HOUR - MIN_PREDATOR_HUNGER_INCREASE_PER_HOUR),
        );
        break;
      case QLearningAction.INCREASE_BUSH_SPREAD:
        gameState.ecosystem.berryBushSpreadChance = Math.min(
          MAX_BERRY_BUSH_SPREAD_CHANCE,
          gameState.ecosystem.berryBushSpreadChance +
            stepSize * (MAX_BERRY_BUSH_SPREAD_CHANCE - MIN_BERRY_BUSH_SPREAD_CHANCE),
        );
        break;
      case QLearningAction.DECREASE_BUSH_SPREAD:
        gameState.ecosystem.berryBushSpreadChance = Math.max(
          MIN_BERRY_BUSH_SPREAD_CHANCE,
          gameState.ecosystem.berryBushSpreadChance -
            stepSize * (MAX_BERRY_BUSH_SPREAD_CHANCE - MIN_BERRY_BUSH_SPREAD_CHANCE),
        );
        break;
      case QLearningAction.NO_ACTION:
      default:
        // No action taken
        break;
    }
  }

  /**
   * Update Q-table using Q-learning algorithm
   */
  private updateQTable(oldState: string, action: number, reward: number, newState: string): void {
    const oldQValue = this.getQValue(oldState, action);
    const maxNewQValue = Math.max(...Array.from({ length: TOTAL_ACTIONS }, (_, i) => this.getQValue(newState, i)));

    const newQValue = oldQValue + ALPHA * (reward + GAMMA * maxNewQValue - oldQValue);
    this.setQValue(oldState, action, newQValue);
  }

  /**
   * Main Q-learning step with emergency corrections
   */
  public step(gameState: GameWorldState): void {
    const indexedState = gameState as IndexedWorldState;
    const preyCount = indexedState.search.prey.count();
    const predatorCount = indexedState.search.predator.count();
    const bushCount = indexedState.search.berryBush.count();

    // Apply emergency corrections first to prevent ecosystem collapse
    this.applyEmergencyCorrections(preyCount, predatorCount, bushCount, gameState);

    const currentState = this.discretizeState(preyCount, predatorCount, bushCount);

    // If we have a previous state and action, update Q-table
    if (this.lastState !== null && this.lastAction !== null) {
      const reward = this.calculateReward(preyCount, predatorCount, bushCount);
      this.updateQTable(this.lastState, this.lastAction, reward, currentState);
    }

    // Choose and apply action
    const action = this.chooseAction(currentState);
    this.applyAction(action, gameState);

    // Update epsilon (decay exploration over time)
    this.epsilon = Math.max(MIN_EPSILON, this.epsilon * EPSILON_DECAY);

    // Remember current state and action for next update
    this.lastState = currentState;
    this.lastAction = action;
  }

  /**
   * Reset the agent
   */
  public reset(): void {
    this.qTable.clear();
    this.epsilon = INITIAL_EPSILON;
    this.lastState = null;
    this.lastAction = null;
  }

  /**
   * Get statistics for debugging
   */
  public getStats(): { qTableSize: number; explorationRate: number } {
    return {
      qTableSize: this.qTable.size,
      explorationRate: this.epsilon,
    };
  }
}

// Global Q-learning agent instance
let qLearningAgent = new QLearningAgent();

/**
 * Q-learning based ecosystem balancer with safety fallback and population resurrection
 */
function updateEcosystemBalancerQLearning(gameState: GameWorldState): void {
  handlePopulationExtinction(gameState);
  emergencyPopulationBoost(gameState);

  // Initialize ecosystem parameters to more balanced values on first run
  if (!gameState.ecosystem.lastUpdateTime) {
    // Start with parameters that favor survival and reproduction
    gameState.ecosystem.preyGestationPeriod =
      MIN_PREY_GESTATION_PERIOD + (MAX_PREY_GESTATION_PERIOD - MIN_PREY_GESTATION_PERIOD) * 0.3; // Lower gestation = faster reproduction
    gameState.ecosystem.preyProcreationCooldown =
      MIN_PREY_PROCREATION_COOLDOWN + (MAX_PREY_PROCREATION_COOLDOWN - MIN_PREY_PROCREATION_COOLDOWN) * 0.3; // Lower cooldown = more frequent reproduction
    gameState.ecosystem.preyHungerIncreasePerHour =
      MIN_PREY_HUNGER_INCREASE_PER_HOUR + (MAX_PREY_HUNGER_INCREASE_PER_HOUR - MIN_PREY_HUNGER_INCREASE_PER_HOUR) * 0.3; // Lower hunger rate = better survival
    gameState.ecosystem.predatorGestationPeriod =
      MIN_PREDATOR_GESTATION_PERIOD + (MAX_PREDATOR_GESTATION_PERIOD - MIN_PREDATOR_GESTATION_PERIOD) * 0.3;
    gameState.ecosystem.predatorProcreationCooldown =
      MIN_PREDATOR_PROCREATION_COOLDOWN + (MAX_PREDATOR_PROCREATION_COOLDOWN - MIN_PREDATOR_PROCREATION_COOLDOWN) * 0.3;
    gameState.ecosystem.predatorHungerIncreasePerHour =
      MIN_PREDATOR_HUNGER_INCREASE_PER_HOUR +
      (MAX_PREDATOR_HUNGER_INCREASE_PER_HOUR - MIN_PREDATOR_HUNGER_INCREASE_PER_HOUR) * 0.3;
    gameState.ecosystem.berryBushSpreadChance =
      MIN_BERRY_BUSH_SPREAD_CHANCE + (MAX_BERRY_BUSH_SPREAD_CHANCE - MIN_BERRY_BUSH_SPREAD_CHANCE) * 0.7; // Higher spread chance = more food
  }

  // Apply Q-learning step
  qLearningAgent.step(gameState);
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
export function resetEcosystemBalancer(): void {
  qLearningAgent.reset();
}

/**
 * Get Q-learning agent statistics for debugging
 */
export function getEcosystemBalancerStats(): {
  qTableSize: number;
  explorationRate: number;
} | null {
  return qLearningAgent.getStats();
}
