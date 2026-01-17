import { GameWorldState } from '../world-types';
import { VisualEffect, VisualEffectId, VisualEffectType } from '../visual-effects/visual-effect-types';
import { Vector2D } from './math-types';
import { EntityId } from '../entities/entities-types';

export function addVisualEffect(
  gameState: GameWorldState,
  type: VisualEffectType,
  position: Vector2D,
  duration: number,
  intensity?: number,
  entityId?: EntityId,
  targetPosition?: Vector2D,
  targetEntityId?: EntityId,
): VisualEffectId {
  const newEffect: VisualEffect = {
    id: gameState.nextVisualEffectId,
    type,
    position,
    startTime: gameState.time,
    duration,
    entityId,
    intensity,
    targetPosition,
    targetEntityId,
  };
  gameState.visualEffects.push(newEffect);
  gameState.nextVisualEffectId++;
  return newEffect.id;
}
