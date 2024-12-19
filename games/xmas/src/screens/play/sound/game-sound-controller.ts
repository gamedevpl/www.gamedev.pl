import { GameWorldState, Santa } from '../game-world/game-world-types';
import { soundEngine } from './sound-arcade-engine';

interface SoundEventState {
  lastPlayTime: number;
  isPlaying: boolean;
}

/**
 * Manages and controls all game sounds based on game world state
 */
export class GameSoundController {
  private soundEvents: Map<string, SoundEventState> = new Map();
  private readonly DEBOUNCE_TIMES = {
    movement: 200,    // Minimum time between movement sounds
    collision: 100,   // Minimum time between collision sounds
    charging: 50,     // Minimum time between charging sound updates
    gift: 200,        // Minimum time between gift collection sounds
  };

  private previousState?: {
    wasCharging: boolean;
    santaPositions: Map<string, { x: number; y: number }>;
  };

  constructor() {
    this.previousState = {
      wasCharging: false,
      santaPositions: new Map(),
    };
  }

  /**
   * Main update method to be called on each game tick
   */
  update(state: GameWorldState) {
    this.updateAmbientSounds(state);
    this.updateSantaSounds(state);
    this.updateCollisionSounds(state);
    this.updateGiftSounds(state);
    this.savePreviousState(state);
  }

  /**
   * Manages ambient background sounds
   */
  private updateAmbientSounds(state: GameWorldState) {
    // Start ambient sounds if game is active
    if (!state.gameOver) {
      soundEngine.startWindAmbientSound();
      soundEngine.startChristmasAmbientSound();
    } else {
      // Stop ambient sounds on game over
      soundEngine.stopWindAmbientSound();
      soundEngine.stopChristmasAmbientSound();
    }
  }

  /**
   * Updates sounds related to Santa's actions
   */
  private updateSantaSounds(state: GameWorldState) {
    const { playerSanta } = state;
    
    // Handle charging sound
    if (playerSanta.input.charging && !this.previousState!.wasCharging) {
      soundEngine.startChargingSound();
    } else if (!playerSanta.input.charging && this.previousState!.wasCharging) {
      soundEngine.stopChargingSound();
      // Play fireball launch sound if charge was released
      if (playerSanta.energy > 0) {
        soundEngine.fireballLaunchSound(playerSanta.energy / 100);
      }
    }

    // Handle movement sounds for all Santas
    state.santas.forEach(santa => {
      if (!santa.isEliminated) {
        this.updateSantaMovementSound(santa);
      }
    });
  }

  /**
   * Updates collision-related sounds
   */
  private updateCollisionSounds(state: GameWorldState) {
    state.santas.forEach(santa => {
      if (santa.fireballContactTime && this.canPlaySound('collision')) {
        soundEngine.collisionSound();
        this.markSoundPlayed('collision');
      }
    });
  }

  /**
   * Updates gift collection sounds
   */
  private updateGiftSounds(state: GameWorldState) {
    // Check if the number of gifts collected has increased
    const prevGiftsCount = this.getPreviousGiftsCount();
    if (state.giftsCollectedCount > prevGiftsCount && this.canPlaySound('gift')) {
      soundEngine.giftCollectionSound();
      this.markSoundPlayed('gift');
    }
  }

  /**
   * Handles movement sound for a single Santa
   */
  private updateSantaMovementSound(santa: Santa) {
    const prevPos = this.previousState!.santaPositions.get(santa.id);
    if (!prevPos) return;

    const dx = santa.x - prevPos.x;
    const dy = santa.y - prevPos.y;
    const movement = Math.sqrt(dx * dx + dy * dy);

    // Play movement sound if there's significant movement and enough time has passed
    if (movement > 0.5 && this.canPlaySound('movement')) {
      soundEngine.santaMovementSound();
      this.markSoundPlayed('movement');
    }
  }

  /**
   * Checks if enough time has passed to play a sound
   */
  private canPlaySound(soundType: keyof typeof this.DEBOUNCE_TIMES): boolean {
    const event = this.soundEvents.get(soundType);
    if (!event) {
      this.soundEvents.set(soundType, { lastPlayTime: 0, isPlaying: false });
      return true;
    }

    const now = Date.now();
    return now - event.lastPlayTime >= this.DEBOUNCE_TIMES[soundType];
  }

  /**
   * Marks a sound as played
   */
  private markSoundPlayed(soundType: keyof typeof this.DEBOUNCE_TIMES) {
    this.soundEvents.set(soundType, {
      lastPlayTime: Date.now(),
      isPlaying: true,
    });
  }

  /**
   * Saves the current state for comparison in the next update
   */
  private savePreviousState(state: GameWorldState) {
    const santaPositions = new Map();
    state.santas.forEach(santa => {
      santaPositions.set(santa.id, { x: santa.x, y: santa.y });
    });

    this.previousState = {
      wasCharging: state.playerSanta.input.charging,
      santaPositions,
    };
  }

  /**
   * Gets the previous gifts count
   */
  private getPreviousGiftsCount(): number {
    // If we don't have a previous state, assume 0
    return 0;
  }

  /**
   * Cleanup method to be called when the game ends
   */
  cleanup() {
    soundEngine.stopChargingSound();
    soundEngine.stopWindAmbientSound();
    soundEngine.stopChristmasAmbientSound();
    this.soundEvents.clear();
    this.previousState = {
      wasCharging: false,
      santaPositions: new Map(),
    };
  }
}

// Export a singleton instance
export const gameSoundController = new GameSoundController();