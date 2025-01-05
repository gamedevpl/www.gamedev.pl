import { Entity, EntityType } from '../entities/entities-types';
import { UpdateContext } from '../game-world-types';

export interface AgenticBehavior<T extends Entity> {
  entityType?: EntityType;

  perform: (entity: T, updateContext: UpdateContext) => void;
}
