import { Entity, EntityType } from '../entities/entities-types';
import { UpdateContext } from '../world-types';

/**
 * Defines the structure for an interaction between two entities.
 * S: Type of the source entity for this interaction.
 * T: Type of the target entity for this interaction.
 */
export interface InteractionDefinition<S extends Entity = Entity, T extends Entity = Entity> {
  /** A unique identifier for the interaction, useful for debugging or logging. */
  id: string;

  /** Optional: Specifies the required type of the source entity for this interaction. */
  sourceType?: EntityType;

  /** Optional: Specifies the required type of the target entity for this interaction. */
  targetType?: EntityType;

  /** The maximum distance (in pixels) between source and target for the interaction to be considered. */
  maxDistance: number;

  /**
   * A function that checks if the interaction can currently occur between the source and target.
   * @param source The potential source entity of the interaction.
   * @param target The potential target entity of the interaction.
   * @param context The current game update context.
   * @returns True if the interaction conditions are met, false otherwise.
   */
  checker: (source: S, target: T, context: UpdateContext) => boolean;

  /**
   * A function that performs the interaction's effects on the source and/or target entities.
   * This is called only if the checker function returns true.
   * @param source The source entity of the interaction.
   * @param target The target entity of the interaction.
   * @param context The current game update context.
   */
  perform: (source: S, target: T, context: UpdateContext) => void;
}