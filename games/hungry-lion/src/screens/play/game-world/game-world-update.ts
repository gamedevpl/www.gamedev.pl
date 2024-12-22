import { GameWorldState } from './game-world-types';
import { gameSoundController } from '../sound/game-sound-controller';

/**
 * Updates game world state for a single frame
 */
export function updateGameWorld(state: GameWorldState, deltaTime: number) {
  // Update time
  state.time += deltaTime;

  // Skip updates if game is over
  if (state.gameOver) {
    // Clean up sounds when game is over
    gameSoundController.cleanup();
    return state;
  }
  // Update sound controller with current game state
  gameSoundController.update();

  return state;
}
