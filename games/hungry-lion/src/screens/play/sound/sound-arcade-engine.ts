import { ArcadeAudio } from './arcade-audio';

const DEFAULT_VOLUME = 0.15; // Default volume level (15%)

class SoundArcadeEngine {
  private audio: ArcadeAudio;
  private ambienceInterval?: NodeJS.Timeout;
  private lionInterval?: NodeJS.Timeout;

  constructor() {
    this.audio = new ArcadeAudio();
    this.initializeSounds();
    // Set initial volume
    this.setMasterVolume(DEFAULT_VOLUME);
  }

  private async initializeSounds() {
    // Movement sound - soft padding sound
    await this.audio.add('movement', 10, [
      // eslint-disable-next-line no-sparse-arrays
      [3, 0.01, 0.02, , 0.1, 0.1, , , , , , , , , , , , , 0.8, , , 0.1, , 0.2],
    ]);
  }

  /**
   * Set the master volume for all sounds
   * @param volume Volume level between 0 (muted) and 1 (full volume)
   */
  setMasterVolume(volume: number): void {
    this.audio.setMasterVolume(volume);
  }

  /**
   * Get the current master volume
   * @returns Current volume level between 0 and 1
   */
  getMasterVolume(): number {
    return this.audio.getMasterVolume();
  }

  // Game sound effects
  playRoar(intensity: number = 1) {
    if (intensity > 0.5) {
      this.audio.play('roar');
    }
  }

  playFoodCollection() {
    this.audio.play('food');
  }

  playMovement() {
    this.audio.play('movement');
  }

  playCollision() {
    this.audio.play('collision');
  }

  playJump() {
    this.audio.play('jump');
  }

  playLand() {
    this.audio.play('land');
  }

  playPowerup() {
    this.audio.play('powerup');
  }

  // Lion state sounds
  startGrowl() {
    if (!this.lionInterval) {
      const playGrowl = () => this.audio.play('growl');
      playGrowl(); // Play immediately
      this.lionInterval = setInterval(playGrowl, 2000);
    }
  }

  stopGrowl() {
    if (this.lionInterval) {
      clearInterval(this.lionInterval);
      this.lionInterval = undefined;
    }
  }

  // Ambient sounds
  startAmbience() {
    if (!this.ambienceInterval) {
      const playAmbience = () => this.audio.play('ambience');
      playAmbience(); // Play immediately
      this.ambienceInterval = setInterval(playAmbience, 10000); // Repeat every 10 seconds
    }
  }

  stopAmbience() {
    if (this.ambienceInterval) {
      clearInterval(this.ambienceInterval);
      this.ambienceInterval = undefined;
    }
  }

  // Cleanup method
  cleanup() {
    this.stopGrowl();
    this.stopAmbience();
  }
}

export const soundEngine = new SoundArcadeEngine();
