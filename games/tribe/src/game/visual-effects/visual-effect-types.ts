import { EntityId } from '../entities/entities-types';
import { Vector2D } from '../utils/math-types';

export type VisualEffectId = number;

export enum VisualEffectType {
  Hunger,
  Procreation,
  Pregnant,
  TargetAcquired,
  Attack,
  Partnered,
  BushClaimed,
  BushClaimLost,
  Eating,
  ChildFed,
  Stunned,
  AttackDeflected,
  AttackResisted,
}

export interface VisualEffect {
  id: VisualEffectId;
  type: VisualEffectType;
  position: Vector2D;
  startTime: number; // Game time in hours
  duration: number; // Duration in game hours
  entityId?: EntityId; // Optional entity to attach the effect to
}
