import { GameWorldState } from '../types/world-types';

/**
 * Handles global keyboard shortcuts that are not direct player actions.
 *
 * @param key The key that was pressed (lowercase).
 * @param gameState The current game state.
 * @returns An object containing the potentially new game state and a boolean indicating if the key was handled.
 */
export const handleKeyDown = (
  key: string,
  gameState: GameWorldState,
): { newState: GameWorldState; handled: boolean } => {
  let handled = true;
  
  switch (key) {
    case ' ':
    case 'p':
      // This function will mutate the state directly for simplicity in the game loop
      gameState.isPaused = !gameState.isPaused;
      break;
    default:
      handled = false;
      break;
  }

  return { newState: gameState, handled };
};
