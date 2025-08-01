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
} from '../world-consts';
import { EcosystemState } from './ecosystem-types';

// State discretization for Q-table
export interface EcosystemStateDiscrete {
  preyPopulationLevel: number; // 0-4 (very low, low, normal, high, very high)
  predatorPopulationLevel: number; // 0-4
  bushCountLevel: number; // 0-4
  preyToPredatorRatio: number; // 0-4 (ratios discretized)
  bushToPrey: number; // 0-4 (bush to prey ratio)
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
    return `${state.preyPopulationLevel}_${state.predatorPopulationLevel}_${state.bushCountLevel}_${state.preyToPredatorRatio}_${state.bushToPrey}`;
  }

  private actionToKey(action: EcosystemAction): string {
    return `${action.parameter}_${action.adjustment}`;
  }

  private discretizeState(preyCount: number, predatorCount: number, bushCount: number): EcosystemStateDiscrete {
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

    return {
      preyPopulationLevel: discretizePopulation(preyCount, ECOSYSTEM_BALANCER_TARGET_PREY_POPULATION),
      predatorPopulationLevel: discretizePopulation(predatorCount, ECOSYSTEM_BALANCER_TARGET_PREDATOR_POPULATION),
      bushCountLevel: discretizePopulation(bushCount, ECOSYSTEM_BALANCER_TARGET_BUSH_COUNT),
      preyToPredatorRatio: discretizeRatio(preyToPredatorRatio),
      bushToPrey: discretizeBushRatio(bushToPreyRatio),
    };
  }

  private calculateReward(preyCount: number, predatorCount: number, bushCount: number): number {
    // Severely penalize extinctions with very large negative rewards
    if (preyCount === 0) return -1000;
    if (predatorCount === 0) return -500;
    if (bushCount === 0) return -300;

    // Calculate normalized deviations from targets (0 = perfect, 1 = 100% off)
    const preyDeviation = Math.abs(preyCount - ECOSYSTEM_BALANCER_TARGET_PREY_POPULATION) / ECOSYSTEM_BALANCER_TARGET_PREY_POPULATION;
    const predatorDeviation = Math.abs(predatorCount - ECOSYSTEM_BALANCER_TARGET_PREDATOR_POPULATION) / ECOSYSTEM_BALANCER_TARGET_PREDATOR_POPULATION;
    const bushDeviation = Math.abs(bushCount - ECOSYSTEM_BALANCER_TARGET_BUSH_COUNT) / ECOSYSTEM_BALANCER_TARGET_BUSH_COUNT;

    // Early warning penalties for very low populations (before extinction)
    let earlyWarningPenalty = 0;
    if (preyCount < ECOSYSTEM_BALANCER_TARGET_PREY_POPULATION * 0.1) earlyWarningPenalty -= 200;
    if (predatorCount < ECOSYSTEM_BALANCER_TARGET_PREDATOR_POPULATION * 0.1) earlyWarningPenalty -= 100;
    if (bushCount < ECOSYSTEM_BALANCER_TARGET_BUSH_COUNT * 0.1) earlyWarningPenalty -= 100;

    // Base reward calculation (scale: 0-100)
    const preyScore = Math.max(0, 100 - (preyDeviation * 100));
    const predatorScore = Math.max(0, 100 - (predatorDeviation * 100));
    const bushScore = Math.max(0, 100 - (bushDeviation * 100));
    
    // Weighted average (prey is most important)
    const baseReward = (preyScore * 0.5 + predatorScore * 0.3 + bushScore * 0.2);
    
    // Stability bonus for all populations within 30% of target
    let stabilityBonus = 0;
    if (preyDeviation < 0.3 && predatorDeviation < 0.3 && bushDeviation < 0.3) {
      stabilityBonus = 50;
    } else if (preyDeviation < 0.5 && predatorDeviation < 0.5 && bushDeviation < 0.5) {
      stabilityBonus = 25;
    }

    // Ecosystem balance bonus - reward appropriate prey/predator ratio
    const preyToPredatorRatio = predatorCount > 0 ? preyCount / predatorCount : 0;
    const targetRatio = ECOSYSTEM_BALANCER_TARGET_PREY_POPULATION / ECOSYSTEM_BALANCER_TARGET_PREDATOR_POPULATION;
    const ratioDeviation = Math.abs(preyToPredatorRatio - targetRatio) / targetRatio;
    const ratioBonus = ratioDeviation < 0.2 ? 20 : (ratioDeviation < 0.5 ? 10 : 0);

    return baseReward + stabilityBonus + ratioBonus + earlyWarningPenalty;
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
    const adjustmentFactor = 0.25; // Increased from 0.1 for more aggressive changes
    
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

  public act(preyCount: number, predatorCount: number, bushCount: number, ecosystem: EcosystemState): void {
    const currentState = this.discretizeState(preyCount, predatorCount, bushCount);
    
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