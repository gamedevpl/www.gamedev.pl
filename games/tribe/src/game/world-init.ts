import { GameWorldState } from './world-types';

export function initWorld(): GameWorldState {
  // Initialize the game world state
  const initialWorldState = {
    time: 0, // Start at hour 0
  };

  // Set up the game world with the initial state
  // This could involve setting up the canvas, loading assets, etc.
  console.log('Game world initialized:', initialWorldState);

  return initialWorldState;
}
