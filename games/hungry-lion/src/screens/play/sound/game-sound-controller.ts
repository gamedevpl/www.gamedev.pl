import { soundEngine } from './sound-arcade-engine';

/**
 * Manages and controls all game sounds based on game world state
 */
export class GameSoundController {
  constructor() {}

  /**
   * Main update method to be called on each game tick
   */
  update() {}

  /**
   * Cleanup method to be called when the game ends
   */
  cleanup() {
    soundEngine.stopGrowl();
    soundEngine.stopAmbience();
  }
}

// Export a singleton instance
export const gameSoundController = new GameSoundController();
