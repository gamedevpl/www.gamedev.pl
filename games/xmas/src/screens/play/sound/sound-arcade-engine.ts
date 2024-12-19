import { ArcadeAudio } from './arcade-audio';

const DEFAULT_VOLUME = 0.15; // Default volume level (15%)

class SoundArcadeEngine {
  private audio: ArcadeAudio;
  private windInterval?: NodeJS.Timeout;
  private christmasInterval?: NodeJS.Timeout;
  private chargingInterval?: NodeJS.Timeout;

  constructor() {
    this.audio = new ArcadeAudio();
    this.initializeSounds();
    // Set initial volume
    this.setMasterVolume(DEFAULT_VOLUME);
  }

  private async initializeSounds() {
    // Fireball launch sound - energetic whoosh with some noise
    await this.audio.add('fireball', 10, [
      // eslint-disable-next-line no-sparse-arrays
      [3, 0.2, 0.1, , 0.4, 0.3, , 0.5, , , , , , 0.5, , 0.5, 0.1, , 1, , , 0.2, , 0.5],
    ]);

    // Gift collection sound - cheerful bell-like sound
    await this.audio.add('gift', 10, [
      // eslint-disable-next-line no-sparse-arrays
      [2, , 0.2, 0.3, 0.2, 0.5, , 0.2, 0.2, , , 0.2, 0.3, , , , 0.1, , 1, , , , , 0.3],
    ]);

    // Santa movement sound - soft snow crunch
    await this.audio.add('movement', 10, [
      // eslint-disable-next-line no-sparse-arrays
      [3, 0.01, 0.01, , 0.1, 0.2, , , , , , , , , , , , , 1, , , 0.1, , 0.3],
    ]);

    // Collision sound - impact with some noise
    await this.audio.add('collision', 10, [
      // eslint-disable-next-line no-sparse-arrays
      [3, , 0.1, 0.5, 0.1, 0.5, , -0.6, , , , , , 0.4, , , , , 1, , , 0.2, , 0.5],
    ]);

    // Wind ambient sound - soft whoosh
    await this.audio.add('wind', 10, [
      // eslint-disable-next-line no-sparse-arrays
      [0, 0.5, 0.1, , 0.1, 0.2, , -0.3, , , , , , , , , 0.2, -0.2, 0.5, , , , , 0.3],
    ]);

    // Christmas ambient sound - gentle bell-like tones
    await this.audio.add('christmas', 10, [
      // eslint-disable-next-line no-sparse-arrays
      [2, , 0.2, 0.2, 0.2, 0.3, , 0.1, , , , , 0.2, , , , , , 0.5, , , , , 0.2],
    ]);

    // Charging sound - electronic energy build-up effect
    // Multiple variations for a richer charging experience
    await this.audio.add('charging', 10, [
      // Variation 1: Basic charging sound with pitch slide up
      // eslint-disable-next-line no-sparse-arrays
      [1, , 0.1, 0.0, 0.1, 0.2, , 0.2, 0.02, 0.2, 0.5, , , , , , 0.1, -0.1, 0.8, , , , , 0.4],
      // Variation 2: Higher pitched with more electronic feel
      // eslint-disable-next-line no-sparse-arrays
      [1, , 0.15, 0.0, 0.12, 0.25, , 0.25, 0.03, 0.3, 0.6, , , , , , 0.15, -0.15, 0.7, , , , , 0.45],
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

  fireballLaunchSound(energy: number = 1) {
    // Play fireball sound with energy parameter affecting playback
    if (energy > 0.5) {
      this.audio.play('fireball');
    }
  }

  giftCollectionSound() {
    this.audio.play('gift');
  }

  santaMovementSound() {
    this.audio.play('movement');
  }

  collisionSound() {
    this.audio.play('collision');
  }

  startChargingSound() {
    // Start playing charging sound at regular intervals
    if (!this.chargingInterval) {
      const playCharging = () => this.audio.play('charging');
      playCharging(); // Play immediately
      // Play charging sound every 200ms for continuous effect
      this.chargingInterval = setInterval(playCharging, 200);
    }
  }

  stopChargingSound() {
    // Stop charging sound and clean up interval
    if (this.chargingInterval) {
      clearInterval(this.chargingInterval);
      this.chargingInterval = undefined;
    }
  }

  startWindAmbientSound() {
    // Play wind sound at intervals to create continuous ambient effect
    if (!this.windInterval) {
      const playWind = () => this.audio.play('wind');
      playWind(); // Play immediately
      this.windInterval = setInterval(playWind, 2000); // Repeat every 2 seconds
    }
  }

  stopWindAmbientSound() {
    if (this.windInterval) {
      clearInterval(this.windInterval);
      this.windInterval = undefined;
    }
  }

  startChristmasAmbientSound() {
    // Play christmas sound at intervals to create continuous ambient effect
    if (!this.christmasInterval) {
      const playChristmas = () => this.audio.play('christmas');
      playChristmas(); // Play immediately
      this.christmasInterval = setInterval(playChristmas, 3000); // Repeat every 3 seconds
    }
  }

  stopChristmasAmbientSound() {
    if (this.christmasInterval) {
      clearInterval(this.christmasInterval);
      this.christmasInterval = undefined;
    }
  }
}

export const soundEngine = new SoundArcadeEngine();
