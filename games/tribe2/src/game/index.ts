/**
 * Tribe Game - Core Game Logic
 *
 * This file serves as the entry point for the game's core logic.
 * It will contain functions to initialize and manage the game state.
 */
import { MIN_BERRY_BUSH_SPREAD_CHANCE } from './entities/plants/berry-bush/berry-bush-consts.ts';
import {
  MAX_PREDATOR_GESTATION_PERIOD,
  MAX_PREDATOR_HUNGER_INCREASE_PER_HOUR,
  MAX_PREDATOR_PROCREATION_COOLDOWN,
  MAX_PREY_GESTATION_PERIOD,
  MAX_PREY_HUNGER_INCREASE_PER_HOUR,
  MAX_PREY_PROCREATION_COOLDOWN,
} from './animal-consts.ts';
import { initWorld } from './world-init';
import { DebugPanelType, GameWorldState } from './world-types';

export * from './notifications/notification-types';
export * from './notifications/notification-utils';

/**
 * Initialize the game
 * This function will be called when the application loads.
 * It sets up the initial state of the game world according to the MVP GDD.
 */
export function initGame(): GameWorldState {
  console.log('Tribe game initialized with detailed 2D world state.');

  const initialWorldState = initWorld();

  // Initialize ecosystem parameters
  initialWorldState.ecosystem = {
    preyGestationPeriod: MAX_PREY_GESTATION_PERIOD,
    preyProcreationCooldown: MAX_PREY_PROCREATION_COOLDOWN,
    predatorGestationPeriod: MAX_PREDATOR_GESTATION_PERIOD,
    predatorProcreationCooldown: MAX_PREDATOR_PROCREATION_COOLDOWN,
    preyHungerIncreasePerHour: MAX_PREY_HUNGER_INCREASE_PER_HOUR,
    predatorHungerIncreasePerHour: MAX_PREDATOR_HUNGER_INCREASE_PER_HOUR,
    berryBushSpreadChance: MIN_BERRY_BUSH_SPREAD_CHANCE,
  };

  initialWorldState.debugPanel = DebugPanelType.None;
  initialWorldState.performanceMetrics = {
    currentBucket: {
      renderTime: 0,
      worldUpdateTime: 0,
      aiUpdateTime: 0,
    },
    history: [],
  };

  return initialWorldState;
}

export * from './entities/buildings/building-consts.ts';
export * from './entities/buildings/building-types';
