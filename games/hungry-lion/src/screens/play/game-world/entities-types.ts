import { Vector2D } from './math-types';

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
  state: 'idle' | 'moving' | 'fleeing';
  health: number;
  currentBehavior: 'idle' | 'moving';
  lastBehaviorUpdate: number;
}

export interface CarrionEntity extends Entity {
  type: 'carrion';
  food: number;
}

export type Entities = {
  entities: Map<EntityId, Entity>;
  nextEntityId: EntityId;
};
