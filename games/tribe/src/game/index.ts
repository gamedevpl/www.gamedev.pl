/**
 * Tribe Game - Core Game Logic
 *
 * This file serves as the entry point for the game's core logic.
 * It will contain functions to initialize and manage the game state.
 */
import {
  MIN_BERRY_BUSH_SPREAD_CHANCE,
  MIN_PREDATOR_GESTATION_PERIOD,
  MIN_PREDATOR_HUNGER_INCREASE_PER_HOUR,
  MIN_PREDATOR_PROCREATION_COOLDOWN,
  MIN_PREY_GESTATION_PERIOD,
  MIN_PREY_HUNGER_INCREASE_PER_HOUR,
  MIN_PREY_PROCREATION_COOLDOWN,
} from './world-consts';
import { initWorld } from './world-init';
import { GameWorldState } from './world-types';

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
    preyGestationPeriod: MIN_PREY_GESTATION_PERIOD,
    preyProcreationCooldown: MIN_PREY_PROCREATION_COOLDOWN,
    predatorGestationPeriod: MIN_PREDATOR_GESTATION_PERIOD,
    predatorProcreationCooldown: MIN_PREDATOR_PROCREATION_COOLDOWN,
    preyHungerIncreasePerHour: MIN_PREY_HUNGER_INCREASE_PER_HOUR,
    predatorHungerIncreasePerHour: MIN_PREDATOR_HUNGER_INCREASE_PER_HOUR,
    berryBushSpreadChance: MIN_BERRY_BUSH_SPREAD_CHANCE,
  };

  return initialWorldState;
}
