import { GameWorldState } from '../world-types';
import { VisualEffect, VisualEffectId, VisualEffectType } from '../visual-effects/visual-effect-types';
import { Vector2D } from './math-types';
import { EntityId } from '../entities/entities-types';

export function addVisualEffect(
  gameState: GameWorldState,
  type: VisualEffectType,
  position: Vector2D,
  duration: number,
  entityId?: EntityId,
): VisualEffectId {
  const newEffect: VisualEffect = {
    id: gameState.nextVisualEffectId,
    type,
    position,
    startTime: gameState.time,
    duration,
    entityId,
  };
  gameState.visualEffects.push(newEffect);
  gameState.nextVisualEffectId++;
  return newEffect.id;
}

export function removeVisualEffectById(gameState: GameWorldState, effectId: VisualEffectId): void {
  const index = gameState.visualEffects.findIndex((effect) => effect.id === effectId);
  if (index > -1) {
    gameState.visualEffects.splice(index, 1);
  }
}
