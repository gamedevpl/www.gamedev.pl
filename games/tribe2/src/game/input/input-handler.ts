import { BiomeType, GameWorldState } from '../types/world-types';

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
    case '1':
      gameState.terrainEditingMode = !gameState.terrainEditingMode;
      if (gameState.terrainEditingMode) {
        gameState.biomeEditingMode = false; // Disable biome editing
      }
      break;
    case '2':
      gameState.biomeEditingMode = !gameState.biomeEditingMode;
      if (gameState.biomeEditingMode) {
        gameState.terrainEditingMode = false; // Disable terrain editing
      }
      break;
    case '3':
      gameState.selectedBiome = BiomeType.GROUND;
      break;
    case '4':
      gameState.selectedBiome = BiomeType.SAND;
      break;
    case '5':
      gameState.selectedBiome = BiomeType.GRASS;
      break;
    case '6':
      gameState.selectedBiome = BiomeType.ROCK;
      break;
    case '7':
      gameState.selectedBiome = BiomeType.SNOW;
      break;
    default:
      handled = false;
      break;
  }

  return { newState: gameState, handled };
};