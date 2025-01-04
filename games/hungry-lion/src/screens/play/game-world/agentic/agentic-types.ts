import { Entity, EntityType } from '../entities-types';
import { GameWorldState, UpdateContext } from '../game-world-types';

export interface AgenticBehavior<T extends Entity> {
  entityType?: EntityType;

  perform: (gameState: GameWorldState, entity: T, updateContext: UpdateContext) => void;
}
