import { BiomeType, BuildingType, GameWorldState } from '../types/world-types';

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
    case '8':
      gameState.selectedBuilding = BuildingType.HOUSE;
      break;
    case '9':
      gameState.selectedBuilding = BuildingType.BARN;
      break;
    case '0':
      gameState.selectedBuilding = BuildingType.WORKSHOP;
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
    default:
      handled = false;
      break;
  }

  return { newState: gameState, handled };
};
