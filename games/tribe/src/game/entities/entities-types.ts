import { StateData, StateType } from '../state-machine/state-machine-types';
import { Vector2D } from '../utils/math-types';
import { PlantEntity } from './plants/plant-types'; // Added import
import { BerryBushEntity } from './plants/berry-bush/berry-bush-types'; // Added import

export type EntityId = number;

export type EntityType = 'character' | 'berryBush'; // Added 'berryBush'

// Base Entity interface, now extended by more specific types
export interface BaseEntity {
  id: EntityId;
  isPlayer?: boolean;
  type: EntityType;
  position: Vector2D;
  direction: number;
  targetDirection: number;
  acceleration: number;
  forces: Vector2D[];
  velocity: Vector2D;
  stateMachine?: [StateType, StateData];
  debuffs: ActiveDebuff[];
}

/**
 * Represents an active debuff effect on an entity
 */
export interface ActiveDebuff {
  /** Debuff type */
  type: 'slow';
  /** Time when the debuff was applied */
  startTime: number;
  /** Duration of the debuff in milliseconds */
  duration: number;
}

// Union type for all possible entity types in the game
export type Entity =
  | BaseEntity // General entity properties, could be a character if not further specified by PlantEntity or BerryBushEntity
  | PlantEntity // Base for all plants
  | BerryBushEntity; // Specific type for berry bushes

export type Entities = {
  entities: Map<EntityId, Entity>;
  nextEntityId: EntityId;
};
