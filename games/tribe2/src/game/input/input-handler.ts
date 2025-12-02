import { BiomeType, BuildingType, GameWorldState } from '../world-types';

/**
 * Handles global keyboard shortcuts that are not direct player actions.
 *
 * @param key The key that was pressed (lowercase).
 * @param gameState The current game state.
 * @param modifiers Optional modifier keys state.
 * @returns An object containing the potentially new game state and a boolean indicating if the key was handled.
 */
export const handleKeyDown = (
  key: string,
  gameState: GameWorldState,
  modifiers?: { shift: boolean },
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
        gameState.roadEditingMode = false;
        gameState.buildingPlacementMode = false;
      }
      break;
    case '2':
      gameState.biomeEditingMode = !gameState.biomeEditingMode;
      if (gameState.biomeEditingMode) {
        gameState.terrainEditingMode = false; // Disable terrain editing
        gameState.roadEditingMode = false;
        gameState.buildingPlacementMode = false;
      }
      break;
    case '3':
    case '4':
    case '5':
    case '6':
    case '7':
    case '8':
    case '9':
    case '0':
      // Editor biome/building selection disabled for baseline
      break;
    case 'r':
      gameState.roadEditingMode = !gameState.roadEditingMode;
      if (gameState.roadEditingMode) {
        gameState.terrainEditingMode = false; // Disable terrain editing
        gameState.biomeEditingMode = false; // Disable biome editing
        gameState.buildingPlacementMode = false;
      }
      break;
    case 'b':
      gameState.buildingPlacementMode = !gameState.buildingPlacementMode;
      if (gameState.buildingPlacementMode) {
        gameState.terrainEditingMode = false;
        gameState.biomeEditingMode = false;
        gameState.roadEditingMode = false;
      }
      break;
    case 'w':
      gameState.wireframeMode = !gameState.wireframeMode;
      break;
    case 'd':
      if (modifiers?.shift) {
        gameState.debugMode = !gameState.debugMode;
      } else {
        handled = false;
      }
      break;
    default:
      handled = false;
      break;
  }

  return { newState: gameState, handled };
};
