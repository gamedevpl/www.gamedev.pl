import { Entity, EntityId } from '../entities-types';
import { BuildingType } from './building-consts';
import { FoodItem } from '../food-types';
import { Item } from '../item-types';

export { BuildingType };

export type StoredItem = {
  item: FoodItem | Item;
  positionOffset: { x: number; y: number };
};

/**
 * Represents a building entity in the game world.
 * Buildings are stationary structures that can be constructed and destroyed.
 */
export interface BuildingEntity extends Entity {
  /** The specific type of building (e.g., StorageSpot, PlantingZone). */
  buildingType: BuildingType;

  /** ID of the tribe that owns this building. */
  ownerId: EntityId | undefined;

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

  // Storage-related properties (for StorageSpot buildings)
  /** Array of items (food, wood, etc.) stored in the building. */
  storedItems: StoredItem[];

  /** Maximum capacity for stored items. */
  storageCapacity: number;

  /** Game time of last deposit (for cooldown). */
  lastDepositTime?: number;

  /** Game time of last retrieve (for cooldown). */
  lastRetrieveTime?: number;

  /** Game time of last steal attempt (for cooldown). */
  lastStealTime?: number;

  /** Current fuel level (for buildings like Bonfire). */
  fuelLevel?: number;

  /** Maximum fuel level (for buildings like Bonfire). */
  maxFuelLevel?: number;
}
