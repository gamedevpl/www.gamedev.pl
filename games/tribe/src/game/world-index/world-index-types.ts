import { BerryBushEntity } from '../entities/plants/berry-bush/berry-bush-types';
import { HumanCorpseEntity } from '../entities/characters/human/human-corpse-types';
import { HumanEntity } from '../entities/characters/human/human-types';
import { FlagEntity } from '../entities/flag/flag-types';
import { GameWorldState } from '../world-types';
import { Vector2D } from '../utils/math-types';

/**
 * Defines a rectangle for spatial queries.
 */
export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Defines the interface for querying a specific type of entity.
 */
export interface IndexType<T> {
  /**
   * Spatial query for entities within a given rectangle.
   * @param rect The rectangle to search within.
   * @returns An array of entities of type T found within the rectangle.
   */
  byRect(rect: Rect): T[];

  /**
   * Spatial query for entities within a given radius of a point.
   * @param position The center of the search radius.
   * @param distance The radius to search within.
   * @returns An array of entities of type T found within the radius.
   */
  byRadius(position: Vector2D, distance: number): T[];

  /**
   * Non-spatial query for entities matching a specific property value.
   * @param propertyName The name of the property to query.
   * @param propertyValue The value of the property to match.
   * @returns An array of entities of type T that match the property value.
   */
  byProperty(propertyName: keyof T, propertyValue: unknown): T[];

  /**
   * Clears the internal cache for property queries.
   */
  resetPropertyCache(): void;
}

/**
 * An augmented WorldState that includes indexed entity collections for efficient querying.
 */
export interface IndexedWorldState extends GameWorldState {
  search: {
    human: IndexType<HumanEntity>;
    berryBush: IndexType<BerryBushEntity>;
    humanCorpse: IndexType<HumanCorpseEntity>;
    flag: IndexType<FlagEntity>;
  };
}
