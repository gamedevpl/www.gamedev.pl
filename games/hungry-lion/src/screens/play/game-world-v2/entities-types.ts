import { Vector2D } from './math-types';

export type EntityId = number;

export type EntityType = 'lion' | 'prey' | 'carrion';

export type Entity = {
  id: EntityId;
  type: EntityType;
  position: Vector2D;
  velocity?: Vector2D;
  state?: string;
};

export type Entities = {
  entities: Map<EntityId, Entity>;
  nextEntityId: EntityId;
};
