/**
 * Tribe Game - Core Game Logic
 *
 * This file serves as the entry point for the game's core logic.
 * It will contain functions to initialize and manage the game state.
 */
import { initWorld } from './world-init';
import { GameWorldState } from './world-types';

/**
 * Initialize the game
 * This function will be called when the application loads.
 * It sets up the initial state of the game world according to the MVP GDD.
 */
export function initGame(): GameWorldState {
  console.log('Tribe game initialized with 2D positions.');

  const initialWorldState = initWorld();

  return initialWorldState;
}
