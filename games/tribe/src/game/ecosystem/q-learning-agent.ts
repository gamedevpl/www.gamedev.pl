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
import { IndexedWorldState } from '../world-index/world-index-types';
import { HumanEntity } from '../entities/characters/human/human-types';

// State discretization for Q-table - enhanced with child populations and human impact
export interface EcosystemStateDiscrete {
  preyPopulationLevel: number; // 0-4 (very low, low, normal, high, very high)
  predatorPopulationLevel: number; // 0-4
  bushCountLevel: number; // 0-4
  childPreyLevel: number; // 0-4 (non-adult prey population)
  childPredatorLevel: number; // 0-4 (non-adult predator population)
  humanPopulationLevel: number; // 0-4 (human impact on ecosystem)
  preyToPredatorRatio: number; // 0-4 (ratios discretized)
  bushToPrey: number; // 0-4 (bush to prey ratio)
  preyDensityLevel: number; // 0-4 (population density per 1000 pixels²)
  predatorDensityLevel: number; // 0-4
  bushDensityLevel: number; // 0-4
  populationTrend: number; // 0-2 (declining, stable, growing) - based on recent changes
  humanActivity: number; // 0-4 (level of human gathering/planting activity)
}

// Action space - which parameter to adjust and by how much
export interface EcosystemAction {
  parameter: 'preyGestation' | 'preyProcreation' | 'preyHunger' | 
             'predatorGestation' | 'predatorProcreation' | 'predatorHunger' |
             'bushSpread';
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
  private humanActivityHistory: Array<{ time: number; gatheredBushes: number; plantedBushes: number }> = [];
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
    ];
    const adjustments = [-2, -1, 0, 1, 2];

    for (const parameter of parameters) {
      for (const adjustment of adjustments) {
        this.actionSpace.push({ parameter, adjustment });
      }
    }
  }

  private stateToKey(state: EcosystemStateDiscrete): string {
    return `${state.preyPopulationLevel}_${state.predatorPopulationLevel}_${state.bushCountLevel}_${state.childPreyLevel}_${state.childPredatorLevel}_${state.humanPopulationLevel}_${state.preyToPredatorRatio}_${state.bushToPrey}_${state.preyDensityLevel}_${state.predatorDensityLevel}_${state.bushDensityLevel}_${state.populationTrend}_${state.humanActivity}`;
  }

  private actionToKey(action: EcosystemAction): string {
    return `${action.parameter}_${action.adjustment}`;
  }

  private discretizeState(indexedWorldState: IndexedWorldState, gameTime: number): EcosystemStateDiscrete {
    const preyCount = indexedWorldState.search.prey.count();
    const predatorCount = indexedWorldState.search.predator.count();
    const bushCount = indexedWorldState.search.berryBush.count();
    const humanCount = indexedWorldState.search.human.count();
    
    // Get child counts (non-adult entities)
    const childPrey = indexedWorldState.search.prey.byProperty('isAdult', false);
    const childPredators = indexedWorldState.search.predator.byProperty('isAdult', false);
    const childPreyCount = childPrey.length;
    const childPredatorCount = childPredators.length;
    
    // Calculate human activity metrics
    const humans = indexedWorldState.search.human.byProperty('type', 'human') as HumanEntity[];
    let activeGatherers = 0;
    let activePlanters = 0;
    
    for (const human of humans) {
      if (human.activeAction === 'gathering') activeGatherers++;
      if (human.activeAction === 'planting') activePlanters++;
    }
    
    // Track human activity over time
    this.humanActivityHistory.push({ 
      time: gameTime, 
      gatheredBushes: activeGatherers, 
      plantedBushes: activePlanters 
    });
    
    // Keep only recent history (last 24 game hours)
    const maxAge = gameTime - 24;
    this.humanActivityHistory = this.humanActivityHistory.filter(h => h.time > maxAge).slice(-20);
    
    // Calculate average human activity
    const avgGathering = this.humanActivityHistory.length > 0 
      ? this.humanActivityHistory.reduce((sum, h) => sum + h.gatheredBushes, 0) / this.humanActivityHistory.length 
      : 0;
    const avgPlanting = this.humanActivityHistory.length > 0 
      ? this.humanActivityHistory.reduce((sum, h) => sum + h.plantedBushes, 0) / this.humanActivityHistory.length 
      : 0;
    
    const humanActivityLevel = avgGathering + avgPlanting;

    const discretizePopulation = (count: number, target: number): number => {
      const ratio = count / target;
      if (ratio < 0.3) return 0; // very low
      if (ratio < 0.7) return 1; // low
      if (ratio < 1.3) return 2; // normal
      if (ratio < 1.7) return 3; // high
      return 4; // very high
    };

    const discretizeChildPopulation = (count: number, parentCount: number): number => {
      if (parentCount === 0) return 0;
      const ratio = count / parentCount; // Child to adult ratio
      if (ratio < 0.1) return 0; // very low
      if (ratio < 0.3) return 1; // low
      if (ratio < 0.6) return 2; // normal
      if (ratio < 1.0) return 3; // high
      return 4; // very high
    };

    const discretizeHumanActivity = (activityLevel: number): number => {
      if (activityLevel < 0.5) return 0; // very low
      if (activityLevel < 1.5) return 1; // low
      if (activityLevel < 3.0) return 2; // normal
      if (activityLevel < 5.0) return 3; // high
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
    const maxHistoryAge = gameTime - 24; // 1 game day
    this.populationHistory = this.populationHistory.filter(h => h.time > maxHistoryAge).slice(-10);

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
      childPreyLevel: discretizeChildPopulation(childPreyCount, preyCount - childPreyCount),
      childPredatorLevel: discretizeChildPopulation(childPredatorCount, predatorCount - childPredatorCount),
      humanPopulationLevel: discretizePopulation(humanCount, 10), // Assume target human population of 10
      preyToPredatorRatio: discretizeRatio(preyToPredatorRatio),
      bushToPrey: discretizeBushRatio(bushToPreyRatio),
      preyDensityLevel: discretizeDensity(preyDensity, targetPreyDensity),
      predatorDensityLevel: discretizeDensity(predatorDensity, targetPredatorDensity),
      bushDensityLevel: discretizeDensity(bushDensity, targetBushDensity),
      populationTrend,
      humanActivity: discretizeHumanActivity(humanActivityLevel),
    };
  }

  public calculateReward(indexedWorldState: IndexedWorldState): number {
    const preyCount = indexedWorldState.search.prey.count();
    const predatorCount = indexedWorldState.search.predator.count();
    const bushCount = indexedWorldState.search.berryBush.count();
    const humanCount = indexedWorldState.search.human.count();
    
    // Get child counts
    const childPreyCount = indexedWorldState.search.prey.byProperty('isAdult', false).length;
    const childPredatorCount = indexedWorldState.search.predator.byProperty('isAdult', false).length;
    
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
    
    // Child population bonus - reward healthy reproduction
    let reproductionBonus = 0;
    const childPreyRatio = preyCount > 0 ? childPreyCount / preyCount : 0;
    const childPredatorRatio = predatorCount > 0 ? childPredatorCount / predatorCount : 0;
    
    // Reward moderate child populations (indicates healthy reproduction)
    if (childPreyRatio > 0.1 && childPreyRatio < 0.5) reproductionBonus += 10;
    if (childPredatorRatio > 0.1 && childPredatorRatio < 0.5) reproductionBonus += 10;
    
    // Human impact consideration
    let humanImpactAdjustment = 0;
    if (humanCount > 0) {
      // Humans generally put pressure on the ecosystem through gathering
      // Adjust expectations slightly - with humans, we expect lower bush counts but stable prey/predator
      const humanPressure = Math.min(humanCount / 10, 1.0); // Normalize human count
      humanImpactAdjustment = -5 * humanPressure; // Small penalty for human pressure
      
      // But reward if ecosystem remains stable despite human presence
      if (preyCount >= ECOSYSTEM_BALANCER_TARGET_PREY_POPULATION * 0.7 && 
          predatorCount >= ECOSYSTEM_BALANCER_TARGET_PREDATOR_POPULATION * 0.7) {
        humanImpactAdjustment += 15; // Bonus for maintaining stability with humans
      }
    }

    return baseReward + stabilityBonus + ratioBonus + diversityBonus + densityBonus + trendBonus + reproductionBonus + humanImpactAdjustment + earlyWarningPenalty;
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
    }
  }

  public act(_preyCount: number, _predatorCount: number, _bushCount: number, _ecosystem: EcosystemState, _gameTime: number): void {
    // This method is kept for backward compatibility but should not be used with the enhanced agent
    console.warn('Using deprecated act method. Please use updateQ and chooseAndApplyAction separately.');
  }

  /**
   * Update Q-value based on reward from previous action
   * This should be called AFTER the world simulation has run
   * Uses immediate reward but incorporates population trend analysis
   */
  public updateQ(immediateReward: number, indexedWorldState: IndexedWorldState, gameTime: number): void {
    const currentState = this.discretizeState(indexedWorldState, gameTime);
    
    if (this.lastState && this.lastAction) {
      // Use immediate reward but weight it with recent population trends
      let finalReward = immediateReward;
      
      // If we have enough population history, add trend-based adjustment
      if (this.populationHistory.length >= 3) {
        const recent = this.populationHistory.slice(-3);
        const totalRecent = recent.map(h => h.prey + h.predators + h.bushes);
        
        // Reward improving trends, penalize declining trends
        let trendAdjustment = 0;
        if (totalRecent[2] > totalRecent[1] && totalRecent[1] > totalRecent[0]) {
          trendAdjustment = 20; // Reward consistent improvement
        } else if (totalRecent[2] < totalRecent[1] && totalRecent[1] < totalRecent[0]) {
          trendAdjustment = -20; // Penalize consistent decline
        }
        
        finalReward += trendAdjustment;
      }
      
      const oldQValue = this.getQValue(this.lastState, this.lastAction);
      
      // Find max Q-value for current state
      let maxQValue = Number.NEGATIVE_INFINITY;
      for (const action of this.actionSpace) {
        const qValue = this.getQValue(currentState, action);
        maxQValue = Math.max(maxQValue, qValue);
      }
      
      // Q-learning update rule
      const newQValue = oldQValue + this.config.learningRate * 
        (finalReward + this.config.discountFactor * maxQValue - oldQValue);
      
      this.setQValue(this.lastState, this.lastAction, newQValue);
    }
    
    this.lastState = currentState;
  }

  /**
   * Choose and apply action for current state
   * This should be called BEFORE the world simulation runs
   */
  public chooseAndApplyAction(indexedWorldState: IndexedWorldState, ecosystem: EcosystemState, gameTime: number): void {
    const currentState = this.discretizeState(indexedWorldState, gameTime);
    const action = this.selectAction(currentState);
    this.applyAction(ecosystem, action);
    
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