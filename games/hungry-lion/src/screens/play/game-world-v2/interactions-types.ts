import { Entity, EntityType } from './entities-types';
import { UpdateContext } from './game-world-types';

export type InteractionDefinition = {
  sourceType?: EntityType;
  targetType?: EntityType;

  minDistance?: number;
  maxDistance?: number;

  /**
   * Check if the interaction is happening.
   */
  checker: (source: Entity, target: Entity, updateContext: UpdateContext) => boolean;

  /**
   * Perform the interaction.
   */
  perform: (source: Entity, target: Entity, updateContext: UpdateContext) => void;
};
