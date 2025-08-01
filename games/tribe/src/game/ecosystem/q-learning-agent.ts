/**
 * Q-learning agent for dynamic ecosystem balancing.
 * Uses reinforcement learning to maintain stable populations of prey, predators, and bushes.
 */

import {
  ECOSYSTEM_BALANCER_TARGET_BUSH_COUNT,
  ECOSYSTEM_BALANCER_TARGET_PREDATOR_POPULATION,
  ECOSYSTEM_BALANCER_TARGET_PREY_POPULATION,
  MIN_BERRY_BUSH_SPREAD_CHANCE,
  MAX_BERRY_BUSH_SPREAD_CHANCE,
  MIN_PREDATOR_GESTATION_PERIOD,
  MAX_PREDATOR_GESTATION_PERIOD,
  MIN_PREDATOR_HUNGER_INCREASE_PER_HOUR,
  MAX_PREDATOR_HUNGER_INCREASE_PER_HOUR,
  MIN_PREDATOR_PROCREATION_COOLDOWN,
  MAX_PREDATOR_PROCREATION_COOLDOWN,
  MIN_PREY_GESTATION_PERIOD,
  MAX_PREY_GESTATION_PERIOD,
  MIN_PREY_HUNGER_INCREASE_PER_HOUR,
  MAX_PREY_HUNGER_INCREASE_PER_HOUR,
  MIN_PREY_PROCREATION_COOLDOWN,
  MAX_PREY_PROCREATION_COOLDOWN,
  MAP_WIDTH,
  MAP_HEIGHT,
} from '../world-consts';
import { EcosystemState } from './ecosystem-types';

// State discretization for Q-table - enhanced with more environmental factors
export interface EcosystemStateDiscrete {
  preyPopulationLevel: number; // 0-4 (very low, low, normal, high, very high)
  predatorPopulationLevel: number; // 0-4
  bushCountLevel: number; // 0-4
  preyToPredatorRatio: number; // 0-4 (ratios discretized)
  bushToPrey: number; // 0-4 (bush to prey ratio)
  preyDensityLevel: number; // 0-4 (population density per 1000 pixels²)
  predatorDensityLevel: number; // 0-4
  bushDensityLevel: number; // 0-4
  populationTrend: number; // 0-2 (declining, stable, growing) - based on recent changes
}

// Action space - which parameter to adjust and by how much
export interface EcosystemAction {
  parameter: 'preyGestation' | 'preyProcreation' | 'preyHunger' | 
             'predatorGestation' | 'predatorProcreation' | 'predatorHunger' |
             'bushSpread' | 'preySpeed' | 'predatorSpeed' | 
             'preyFleeDistance' | 'predatorHuntRange';
  adjustment: number; // -2, -1, 0, 1, 2 (direction and magnitude)
}

export interface QLearningConfig {
  learningRate: number; // Alpha
  discountFactor: number; // Gamma
  explorationRate: number; // Epsilon
  explorationDecay: number;
  minExplorationRate: number;
}

export class EcosystemQLearningAgent {
  private qTable: Map<string, Map<string, number>>;
  private config: QLearningConfig;
  private lastState?: EcosystemStateDiscrete;
  private lastAction?: EcosystemAction;
  private actionSpace: EcosystemAction[] = [];
  private populationHistory: Array<{ prey: number; predators: number; bushes: number; time: number }> = [];
  private mapArea: number = MAP_WIDTH * MAP_HEIGHT;

  constructor(config: QLearningConfig) {
    this.qTable = new Map();
    this.config = config;
    this.initializeActionSpace();
  }

  private initializeActionSpace(): void {
    this.actionSpace = [];
    const parameters: EcosystemAction['parameter'][] = [
      'preyGestation', 'preyProcreation', 'preyHunger',
      'predatorGestation', 'predatorProcreation', 'predatorHunger',
      'bushSpread'
      // TODO: Add new parameters when ecosystem state supports them:
      // 'preySpeed', 'predatorSpeed', 'preyFleeDistance', 'predatorHuntRange'
    ];
    const adjustments = [-2, -1, 0, 1, 2];

    for (const parameter of parameters) {
      for (const adjustment of adjustments) {
        this.actionSpace.push({ parameter, adjustment });
      }
    }
  }

  private stateToKey(state: EcosystemStateDiscrete): string {
    return `${state.preyPopulationLevel}_${state.predatorPopulationLevel}_${state.bushCountLevel}_${state.preyToPredatorRatio}_${state.bushToPrey}_${state.preyDensityLevel}_${state.predatorDensityLevel}_${state.bushDensityLevel}_${state.populationTrend}`;
  }

  private actionToKey(action: EcosystemAction): string {
    return `${action.parameter}_${action.adjustment}`;
  }

  private discretizeState(preyCount: number, predatorCount: number, bushCount: number, gameTime: number): EcosystemStateDiscrete {
    const discretizePopulation = (count: number, target: number): number => {
      const ratio = count / target;
      if (ratio < 0.3) return 0; // very low
      if (ratio < 0.7) return 1; // low
      if (ratio < 1.3) return 2; // normal
      if (ratio < 1.7) return 3; // high
      return 4; // very high
    };

    const preyToPredatorRatio = predatorCount > 0 ? preyCount / predatorCount : 10;
    const discretizeRatio = (ratio: number): number => {
      if (ratio < 2) return 0;
      if (ratio < 4) return 1;
      if (ratio < 8) return 2;
      if (ratio < 12) return 3;
      return 4;
    };

    const bushToPreyRatio = preyCount > 0 ? bushCount / preyCount : 5;
    const discretizeBushRatio = (ratio: number): number => {
      if (ratio < 0.3) return 0;
      if (ratio < 0.6) return 1;
      if (ratio < 1.0) return 2;
      if (ratio < 1.5) return 3;
      return 4;
    };

    // Calculate population densities per 1000 pixels²
    const preyDensity = (preyCount / this.mapArea) * 1000000;
    const predatorDensity = (predatorCount / this.mapArea) * 1000000;
    const bushDensity = (bushCount / this.mapArea) * 1000000;

    const discretizeDensity = (density: number, targetDensity: number): number => {
      const ratio = density / targetDensity;
      if (ratio < 0.3) return 0;
      if (ratio < 0.7) return 1;
      if (ratio < 1.3) return 2;
      if (ratio < 1.7) return 3;
      return 4;
    };

    // Target densities based on map size
    const targetPreyDensity = (ECOSYSTEM_BALANCER_TARGET_PREY_POPULATION / this.mapArea) * 1000000;
    const targetPredatorDensity = (ECOSYSTEM_BALANCER_TARGET_PREDATOR_POPULATION / this.mapArea) * 1000000;
    const targetBushDensity = (ECOSYSTEM_BALANCER_TARGET_BUSH_COUNT / this.mapArea) * 1000000;

    // Calculate population trend
    this.populationHistory.push({ prey: preyCount, predators: predatorCount, bushes: bushCount, time: gameTime });
    
    // Keep only recent history (last 10 data points or 1 day worth)
    const maxAge = gameTime - 24; // 1 game day
    this.populationHistory = this.populationHistory.filter(h => h.time > maxAge).slice(-10);

    let populationTrend = 1; // stable
    if (this.populationHistory.length >= 3) {
      const recent = this.populationHistory.slice(-3);
      const totalRecent = recent.map(h => h.prey + h.predators + h.bushes);
      const isGrowing = totalRecent[2] > totalRecent[1] && totalRecent[1] > totalRecent[0];
      const isDeclining = totalRecent[2] < totalRecent[1] && totalRecent[1] < totalRecent[0];
      
      if (isGrowing) populationTrend = 2;
      else if (isDeclining) populationTrend = 0;
    }

    return {
      preyPopulationLevel: discretizePopulation(preyCount, ECOSYSTEM_BALANCER_TARGET_PREY_POPULATION),
      predatorPopulationLevel: discretizePopulation(predatorCount, ECOSYSTEM_BALANCER_TARGET_PREDATOR_POPULATION),
      bushCountLevel: discretizePopulation(bushCount, ECOSYSTEM_BALANCER_TARGET_BUSH_COUNT),
      preyToPredatorRatio: discretizeRatio(preyToPredatorRatio),
      bushToPrey: discretizeBushRatio(bushToPreyRatio),
      preyDensityLevel: discretizeDensity(preyDensity, targetPreyDensity),
      predatorDensityLevel: discretizeDensity(predatorDensity, targetPredatorDensity),
      bushDensityLevel: discretizeDensity(bushDensity, targetBushDensity),
      populationTrend,
    };
  }

  private calculateReward(preyCount: number, predatorCount: number, bushCount: number): number {
    // Severely penalize extinctions with very large negative rewards
    if (preyCount === 0) return -1000;
    if (predatorCount === 0) return -800;
    if (bushCount === 0) return -300;

    // Calculate target populations based on map size density
    const targetPreyDensity = (ECOSYSTEM_BALANCER_TARGET_PREY_POPULATION / this.mapArea) * 1000000;
    const targetPredatorDensity = (ECOSYSTEM_BALANCER_TARGET_PREDATOR_POPULATION / this.mapArea) * 1000000;
    const targetBushDensity = (ECOSYSTEM_BALANCER_TARGET_BUSH_COUNT / this.mapArea) * 1000000;

    const currentPreyDensity = (preyCount / this.mapArea) * 1000000;
    const currentPredatorDensity = (predatorCount / this.mapArea) * 1000000;
    const currentBushDensity = (bushCount / this.mapArea) * 1000000;

    // Calculate normalized deviations from target densities but cap them to reduce oversensitivity
    const preyDeviation = Math.min(Math.abs(currentPreyDensity - targetPreyDensity) / targetPreyDensity, 2);
    const predatorDeviation = Math.min(Math.abs(currentPredatorDensity - targetPredatorDensity) / targetPredatorDensity, 2);
    const bushDeviation = Math.min(Math.abs(currentBushDensity - targetBushDensity) / targetBushDensity, 2);

    // Strong early warning penalties for very low populations (before extinction)
    let earlyWarningPenalty = 0;
    const preyRatio = currentPreyDensity / targetPreyDensity;
    const predatorRatio = currentPredatorDensity / targetPredatorDensity;
    const bushRatio = currentBushDensity / targetBushDensity;
    
    // More aggressive penalties for very low populations to encourage prevention
    if (preyRatio < 0.05) earlyWarningPenalty -= 600; // Increased
    else if (preyRatio < 0.1) earlyWarningPenalty -= 400; // Increased
    else if (preyRatio < 0.2) earlyWarningPenalty -= 200; // Increased
    else if (preyRatio < 0.3) earlyWarningPenalty -= 50; // New tier
    
    if (predatorRatio < 0.05) earlyWarningPenalty -= 500; // Increased  
    else if (predatorRatio < 0.1) earlyWarningPenalty -= 300; // Increased
    else if (predatorRatio < 0.2) earlyWarningPenalty -= 150; // Increased
    else if (predatorRatio < 0.3) earlyWarningPenalty -= 30; // New tier
    
    if (bushRatio < 0.1) earlyWarningPenalty -= 150; // Increased
    else if (bushRatio < 0.2) earlyWarningPenalty -= 75; // Increased
    else if (bushRatio < 0.3) earlyWarningPenalty -= 25; // New tier

    // Base reward calculation using sigmoid function for smoother rewards
    const sigmoidReward = (deviation: number) => {
      return 100 / (1 + Math.exp(deviation * 3 - 1)); // Sigmoid centered around 0.33 deviation
    };
    
    const preyScore = sigmoidReward(preyDeviation);
    const predatorScore = sigmoidReward(predatorDeviation);
    const bushScore = sigmoidReward(bushDeviation);
    
    // Weighted average (prey is most important, then predators)
    const baseReward = (preyScore * 0.4 + predatorScore * 0.4 + bushScore * 0.2);
    
    // Stability bonus for all populations within acceptable ranges
    let stabilityBonus = 0;
    if (preyDeviation < 0.2 && predatorDeviation < 0.2 && bushDeviation < 0.2) {
      stabilityBonus = 75; // Increased bonus for tight control
    } else if (preyDeviation < 0.4 && predatorDeviation < 0.4 && bushDeviation < 0.4) {
      stabilityBonus = 40; // Increased
    } else if (preyDeviation < 0.6 && predatorDeviation < 0.6 && bushDeviation < 0.6) {
      stabilityBonus = 20; // New tier
    }

    // Ecosystem balance bonus - reward appropriate prey/predator ratio
    const preyToPredatorRatio = predatorCount > 0 ? preyCount / predatorCount : 0;
    const targetRatio = ECOSYSTEM_BALANCER_TARGET_PREY_POPULATION / ECOSYSTEM_BALANCER_TARGET_PREDATOR_POPULATION;
    const ratioDeviation = Math.abs(preyToPredatorRatio - targetRatio) / targetRatio;
    const ratioBonus = ratioDeviation < 0.2 ? 40 : (ratioDeviation < 0.5 ? 20 : 0); // Increased

    // Diversity bonus - reward having all species present with minimum viable populations
    let diversityBonus = 0;
    if (preyCount >= 5 && predatorCount >= 2 && bushCount >= 10) {
      diversityBonus = 30; // Increased for maintaining viable populations
    } else if (preyCount > 0 && predatorCount > 0 && bushCount > 0) {
      diversityBonus = 10; // Basic survival bonus
    }

    // Map utilization bonus - reward proper density utilization
    const averageDensityUtilization = (preyRatio + predatorRatio + bushRatio) / 3;
    const densityBonus = averageDensityUtilization > 0.7 && averageDensityUtilization < 1.3 ? 25 : 0; // Increased

    // Growth trend bonus - reward when populations are recovering
    let trendBonus = 0;
    if (this.populationHistory.length >= 3) {
      const recent = this.populationHistory.slice(-3);
      const totalRecent = recent.map(h => h.prey + h.predators + h.bushes);
      if (totalRecent[2] > totalRecent[1] && totalRecent[1] > totalRecent[0]) {
        trendBonus = 15; // Reward consistent growth
      }
    }

    return baseReward + stabilityBonus + ratioBonus + diversityBonus + densityBonus + trendBonus + earlyWarningPenalty;
  }

  private getQValue(state: EcosystemStateDiscrete, action: EcosystemAction): number {
    const stateKey = this.stateToKey(state);
    const actionKey = this.actionToKey(action);
    
    if (!this.qTable.has(stateKey)) {
      this.qTable.set(stateKey, new Map());
    }
    
    const stateActions = this.qTable.get(stateKey)!;
    return stateActions.get(actionKey) || 0;
  }

  private setQValue(state: EcosystemStateDiscrete, action: EcosystemAction, value: number): void {
    const stateKey = this.stateToKey(state);
    const actionKey = this.actionToKey(action);
    
    if (!this.qTable.has(stateKey)) {
      this.qTable.set(stateKey, new Map());
    }
    
    this.qTable.get(stateKey)!.set(actionKey, value);
  }

  private selectAction(state: EcosystemStateDiscrete): EcosystemAction {
    // Epsilon-greedy action selection
    if (Math.random() < this.config.explorationRate) {
      // Explore: random action
      return this.actionSpace[Math.floor(Math.random() * this.actionSpace.length)];
    } else {
      // Exploit: best known action
      let bestAction = this.actionSpace[0];
      let bestQValue = this.getQValue(state, bestAction);

      for (const action of this.actionSpace) {
        const qValue = this.getQValue(state, action);
        if (qValue > bestQValue) {
          bestQValue = qValue;
          bestAction = action;
        }
      }

      return bestAction;
    }
  }

  private applyAction(ecosystem: EcosystemState, action: EcosystemAction): void {
    const adjustmentFactor = 0.15; // Reduced from 0.25 for more gradual learning
    
    switch (action.parameter) {
      case 'preyGestation':
        ecosystem.preyGestationPeriod = Math.max(MIN_PREY_GESTATION_PERIOD, 
          Math.min(MAX_PREY_GESTATION_PERIOD, 
            ecosystem.preyGestationPeriod + action.adjustment * adjustmentFactor * (MAX_PREY_GESTATION_PERIOD - MIN_PREY_GESTATION_PERIOD)));
        break;
      
      case 'preyProcreation':
        ecosystem.preyProcreationCooldown = Math.max(MIN_PREY_PROCREATION_COOLDOWN,
          Math.min(MAX_PREY_PROCREATION_COOLDOWN,
            ecosystem.preyProcreationCooldown + action.adjustment * adjustmentFactor * (MAX_PREY_PROCREATION_COOLDOWN - MIN_PREY_PROCREATION_COOLDOWN)));
        break;

      case 'preyHunger':
        ecosystem.preyHungerIncreasePerHour = Math.max(MIN_PREY_HUNGER_INCREASE_PER_HOUR,
          Math.min(MAX_PREY_HUNGER_INCREASE_PER_HOUR,
            ecosystem.preyHungerIncreasePerHour + action.adjustment * adjustmentFactor * (MAX_PREY_HUNGER_INCREASE_PER_HOUR - MIN_PREY_HUNGER_INCREASE_PER_HOUR)));
        break;

      case 'predatorGestation':
        ecosystem.predatorGestationPeriod = Math.max(MIN_PREDATOR_GESTATION_PERIOD,
          Math.min(MAX_PREDATOR_GESTATION_PERIOD,
            ecosystem.predatorGestationPeriod + action.adjustment * adjustmentFactor * (MAX_PREDATOR_GESTATION_PERIOD - MIN_PREDATOR_GESTATION_PERIOD)));
        break;

      case 'predatorProcreation':
        ecosystem.predatorProcreationCooldown = Math.max(MIN_PREDATOR_PROCREATION_COOLDOWN,
          Math.min(MAX_PREDATOR_PROCREATION_COOLDOWN,
            ecosystem.predatorProcreationCooldown + action.adjustment * adjustmentFactor * (MAX_PREDATOR_PROCREATION_COOLDOWN - MIN_PREDATOR_PROCREATION_COOLDOWN)));
        break;

      case 'predatorHunger':
        ecosystem.predatorHungerIncreasePerHour = Math.max(MIN_PREDATOR_HUNGER_INCREASE_PER_HOUR,
          Math.min(MAX_PREDATOR_HUNGER_INCREASE_PER_HOUR,
            ecosystem.predatorHungerIncreasePerHour + action.adjustment * adjustmentFactor * (MAX_PREDATOR_HUNGER_INCREASE_PER_HOUR - MIN_PREDATOR_HUNGER_INCREASE_PER_HOUR)));
        break;

      case 'bushSpread':
        ecosystem.berryBushSpreadChance = Math.max(MIN_BERRY_BUSH_SPREAD_CHANCE,
          Math.min(MAX_BERRY_BUSH_SPREAD_CHANCE,
            ecosystem.berryBushSpreadChance + action.adjustment * adjustmentFactor * (MAX_BERRY_BUSH_SPREAD_CHANCE - MIN_BERRY_BUSH_SPREAD_CHANCE)));
        break;
        
      // New parameters - For now just break (would need ecosystem state extensions)
      case 'preySpeed':
      case 'predatorSpeed':
      case 'preyFleeDistance':
      case 'predatorHuntRange':
        // TODO: Implement when ecosystem state supports these parameters
        break;
    }
  }

  public act(preyCount: number, predatorCount: number, bushCount: number, ecosystem: EcosystemState, gameTime: number): void {
    const currentState = this.discretizeState(preyCount, predatorCount, bushCount, gameTime);
    
    // Update Q-value for previous state-action pair if exists
    if (this.lastState && this.lastAction) {
      const reward = this.calculateReward(preyCount, predatorCount, bushCount);
      const oldQValue = this.getQValue(this.lastState, this.lastAction);
      
      // Find max Q-value for current state
      let maxQValue = Number.NEGATIVE_INFINITY;
      for (const action of this.actionSpace) {
        const qValue = this.getQValue(currentState, action);
        maxQValue = Math.max(maxQValue, qValue);
      }
      
      // Q-learning update rule
      const newQValue = oldQValue + this.config.learningRate * 
        (reward + this.config.discountFactor * maxQValue - oldQValue);
      
      this.setQValue(this.lastState, this.lastAction, newQValue);
    }

    // Select and apply action for current state
    const action = this.selectAction(currentState);
    this.applyAction(ecosystem, action);

    // Store state and action for next update
    this.lastState = currentState;
    this.lastAction = action;

    // Decay exploration rate
    this.config.explorationRate = Math.max(
      this.config.minExplorationRate,
      this.config.explorationRate * this.config.explorationDecay
    );
  }

  public getQTableSize(): number {
    let totalEntries = 0;
    for (const stateActions of this.qTable.values()) {
      totalEntries += stateActions.size;
    }
    return totalEntries;
  }

  public reset(): void {
    this.lastState = undefined;
    this.lastAction = undefined;
  }

  // For persistence/loading
  public exportQTable(): any {
    const exported: any = {};
    for (const [stateKey, actions] of this.qTable.entries()) {
      exported[stateKey] = {};
      for (const [actionKey, qValue] of actions.entries()) {
        exported[stateKey][actionKey] = qValue;
      }
    }
    return {
      qTable: exported,
      config: this.config,
    };
  }

  public importQTable(data: any): void {
    this.qTable.clear();
    if (data.qTable) {
      for (const [stateKey, actions] of Object.entries(data.qTable)) {
        const actionMap = new Map<string, number>();
        for (const [actionKey, qValue] of Object.entries(actions as any)) {
          actionMap.set(actionKey, qValue as number);
        }
        this.qTable.set(stateKey, actionMap);
      }
    }
    if (data.config) {
      this.config = { ...this.config, ...data.config };
    }
  }
}