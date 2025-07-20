import { Vector2D } from '../utils/math-types';
import attackSound from './sound-effects/attack.mp3';
import gatherSound from './sound-effects/gather.mp3';
import eatSound from './sound-effects/eat.mp3';
import procreateSound from './sound-effects/procreate.mp3';
import birthSound from './sound-effects/birth.mp3';
import childFedSound from './sound-effects/child-fed.mp3';
import humanDeathSound from './sound-effects/human-death.mp3';
import gameOverSound from './sound-effects/game-over.mp3';
import buttonClickSound from './sound-effects/button-click.mp3';
import soundTrack1 from './music/soundtrack-1.mp3';

export enum SoundType {
  // Player/Human Actions
  Attack,
  Gather,
  Eat,
  Procreate,
  Birth,
  ChildFed,
  HumanDeath,
  Seize,
  CallToAttack,
  TribeSplit,

  // UI/Game State
  GameOver,
  ButtonClick,

  // Music
  SoundTrack1,
}

export const SOUND_FILE_MAP = new Map<SoundType, string>([
  [SoundType.Attack, attackSound],
  [SoundType.Gather, gatherSound],
  [SoundType.Eat, eatSound],
  [SoundType.Procreate, procreateSound],
  [SoundType.Birth, birthSound],
  [SoundType.ChildFed, childFedSound],
  [SoundType.HumanDeath, humanDeathSound],
  [SoundType.GameOver, gameOverSound],
  [SoundType.ButtonClick, buttonClickSound],
  [SoundType.Seize, attackSound],
  [SoundType.CallToAttack, attackSound],
  [SoundType.TribeSplit, procreateSound],
  [SoundType.SoundTrack1, soundTrack1],
]);

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
  trackId?: string; // To identify a sound source for stopping it later
}
