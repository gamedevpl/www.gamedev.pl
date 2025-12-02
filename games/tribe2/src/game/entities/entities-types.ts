import { StateData, StateType } from '../state-machine/state-machine-types';
import { Vector2D } from '../utils/math-types';

export type EntityId = number;

export type EntityType = 'berryBush' | 'human' | 'corpse' | 'prey' | 'predator' | 'building';

// Base Entity interface, now extended by more specific types
export interface Entity {
  id: EntityId;
  isPlayer?: boolean;
  type: EntityType;
  position: Vector2D;
  radius: number;
  direction: Vector2D;
  acceleration: number;
  forces: Vector2D[];
  velocity: Vector2D;
  stateMachine?: [StateType, StateData];
  debuffs: ActiveDebuff[];
  gatheringCooldownTime?: number;
  eatingCooldownTime?: number;
  isHighlighted?: boolean;
}

/**
 * Represents an active debuff effect on an entity
 */
interface ActiveDebuff {
  /** Debuff type */
  type: 'slow';
  /** Time when the debuff was applied */
  startTime: number;
  /** Duration of the debuff in milliseconds */
  duration: number;
}

export type Entities = {
  entities: Map<EntityId, Entity>;
  nextEntityId: EntityId;
};
