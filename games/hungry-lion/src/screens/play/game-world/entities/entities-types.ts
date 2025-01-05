import { Vector2D } from '../utils/math-types';

export type EntityId = number;

export type EntityType = 'lion' | 'prey' | 'carrion';

export interface Entity {
  id: EntityId;
  isPlayer?: boolean;
  type: EntityType;
  position: Vector2D;
  direction: number;
  targetDirection: number;
  acceleration: number;
  forces: Vector2D[];
  velocity: Vector2D;
}

export interface LionEntity extends Entity {
  type: 'lion';
  target: {
    entityId?: EntityId;
    position?: Vector2D;
  };
}

export interface PreyEntity extends Entity {
  type: 'prey';
  /** Current behavioral state of the prey */
  state: 'idle' | 'moving' | 'fleeing' | 'eating' | 'drinking';
  /** Health level (0-100). At 0, prey becomes carrion */
  health: number;
  /** Hunger level (0-100). At 0, health starts decreasing */
  hungerLevel: number;
  /** Thirst level (0-100). At 0, health starts decreasing */
  thirstLevel: number;
  /** Stamina level (0-100). At 0, prey can't move */
  staminaLevel: number;
}

export interface CarrionEntity extends Entity {
  type: 'carrion';
  food: number;
  decay: number;
}

export type Entities = {
  entities: Map<EntityId, Entity>;
  nextEntityId: EntityId;
};
