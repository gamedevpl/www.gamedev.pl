import { findPlayerEntity } from '../utils/world-utils';
import { UpdateContext } from '../world-types';
import { SoundType } from './sound-types';
import { playSound } from './sound-utils';
import { Vector2D } from '../utils/math-types';

export function playSoundAt(context: UpdateContext, soundType: SoundType, position: Vector2D) {
  const player = findPlayerEntity(context.gameState);
  if (!player) {
    return;
  }

  playSound(soundType, {
    position,
    listenerPosition: player.position,
    worldDimensions: context.gameState.mapDimensions,
    masterVolume: context.gameState.masterVolume,
    isMuted: context.gameState.isMuted,
  });
}
