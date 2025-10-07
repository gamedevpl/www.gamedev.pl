import { Vector2D } from '../types/math-types';

/**
 * Defines the types of sounds that can be played in the game.
 * This enum should be extended with game-specific sounds.
 */
export enum SoundType {
  ButtonClick,
  GameStart,
  // TODO: Add game-specific sound types here for Tribe2
}

/**
 * Maps each SoundType to its corresponding audio file path.
 * This map needs to be populated with the actual sound assets for the game.
 */
export const SOUND_FILE_MAP = new Map<SoundType, string>([
  // TODO: Map SoundType enums to actual sound file paths (e.g., using imports)
  // Example: [SoundType.ButtonClick, buttonClickSound],
]);

/**
 * Defines the options for playing a sound, including positional audio,
 * volume, and looping.
 */
export interface SoundOptions {
  position?: Vector2D;
  listenerPosition?: Vector2D;
  worldDimensions?: {
    width: number;
    height: number;
  };
  masterVolume?: number;
  isMuted?: boolean;
  loop?: boolean;
  trackId?: string; // Unique ID to allow stopping this sound later
}
