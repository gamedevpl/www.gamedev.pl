import { Entity, EntityType } from '../entities/entities-types';
import { UpdateContext } from '../game-world-types';

export interface InteractionDefinition<S extends Entity = Entity, T extends Entity = Entity> {
  sourceType?: EntityType;
  targetType?: EntityType;

  minDistance?: number;
  maxDistance?: number;

  /**
   * Check if the interaction is happening.
   */
  checker: (source: S, target: T, updateContext: UpdateContext) => boolean;

  /**
   * Perform the interaction.
   */
  perform: (source: S, target: T, updateContext: UpdateContext) => void;
}
