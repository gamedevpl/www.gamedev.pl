import { Vector2D } from './math-types';

export type EntityId = number;

export type EntityType = 'lion' | 'prey';

export interface Entity {
  id: EntityId;
  isPlayer?: boolean;
  type: EntityType;
  position: Vector2D;
  direction: number;
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
  state: 'idle' | 'moving' | 'fleeing' | 'caught' | 'carrion';
}

export type Entities = {
  entities: Map<EntityId, Entity>;
  nextEntityId: EntityId;
};
