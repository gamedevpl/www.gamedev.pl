import { Vector2D } from '../utils/math-types';

export enum SoundType {
  // Player/Human Actions
  Attack,
  Gather,
  Eat,
  Procreate,
  Birth,
  ChildFed,
  HumanDeath,

  // UI/Game State
  GameOver,
  ButtonClick,
}

export interface SoundOptions {
  position?: Vector2D;
  listenerPosition?: Vector2D;
  worldDimensions?: {
    width: number;
    height: number;
  };
  masterVolume?: number;
  isMuted?: boolean;
}
