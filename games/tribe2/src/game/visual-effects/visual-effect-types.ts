import { EntityId } from '../entities/entities-types';
import { Vector2D } from '../utils/math-types';

export type VisualEffectId = number;

export enum VisualEffectType {
  Procreation,
  Pregnant,
  TargetAcquired,
  Attack,
  Partnered,
  BushClaimed,
  BushClaimLost,
  Eating,
  ChildFed,
  AttackDeflected,
  AttackResisted,
  Hit,
  SeizeBuildup,
  Seize,
  AutopilotMoveTarget,
  BorderClaim,
  StoneProjectile,
  Fire,
  Smoke,
}

export interface VisualEffect {
  id: VisualEffectId;
  type: VisualEffectType;
  position: Vector2D;
  startTime: number; // Game time in hours
  duration: number; // Duration in game hours
  intensity?: number; // Optional intensity value (0 to 1) for scaling effect appearance
  entityId?: EntityId; // Optional entity to attach the effect to
  targetEntityId?: EntityId; // Optional target entity for projectiles to track
  targetPosition?: Vector2D; // Optional target position for projectiles
}
