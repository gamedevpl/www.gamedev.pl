import { Entity, EntityId } from '../entities-types';
import { BuildingType } from '../../building-consts';

export { BuildingType };

/**
 * Represents a building entity in the game world.
 * Buildings are stationary structures that can be constructed and destroyed.
 */
export interface BuildingEntity extends Entity {
  /** The specific type of building (e.g., StorageSpot, PlantingZone). */
  buildingType: BuildingType;

  /** ID of the tribe that owns this building. */
  ownerId: EntityId;

  /** Progress of construction, from 0.0 to 1.0. */
  constructionProgress: number;

  /** Progress of destruction, from 0.0 to 1.0. */
  destructionProgress: number;

  /** Flag indicating if the building is fully constructed and functional. */
  isConstructed: boolean;

  /** Flag indicating if the building is currently being dismantled/destroyed. */
  isBeingDestroyed: boolean;

  /** Width of the building in pixels. */
  width: number;

  /** Height of the building in pixels. */
  height: number;
}
