/**
 * Resource management system for Tribe2
 * 
 * Handles resource storage, transfer, and capacity management for buildings
 */

import { BuildingEntity } from '../entities/buildings/building-entity';
import { ResourceType } from '../buildings/building-types';
import { getBuildingDefinition } from '../buildings/building-definitions';

// Resource capacity constants
const DEFAULT_STORAGE_CAPACITY = 100;
const WAREHOUSE_STORAGE_CAPACITY = 1000;

/**
 * Gets the storage capacity for a building's resource type
 */
export function getStorageCapacity(building: BuildingEntity, resourceType: ResourceType): number {
  const definition = getBuildingDefinition(building.buildingType);
  
  // Warehouse has special high capacity
  if (building.buildingType === 'Warehouse') {
    return WAREHOUSE_STORAGE_CAPACITY;
  }
  
  // Check if this resource is an output of this building
  const isOutput = definition.production?.outputs?.some(output => output.resource === resourceType);
  if (isOutput) {
    return DEFAULT_STORAGE_CAPACITY * 2; // Production buildings have more output storage
  }
  
  return DEFAULT_STORAGE_CAPACITY;
}

/**
 * Adds resources to a building's storage
 * Returns the amount actually added (may be less than requested if capacity reached)
 */
export function addResourcesToBuilding(
  building: BuildingEntity,
  resourceType: ResourceType,
  amount: number,
  isInput: boolean = true
): number {
  const storage = isInput ? building.inputStorage : building.outputStorage;
  const currentAmount = storage.get(resourceType) || 0;
  const capacity = getStorageCapacity(building, resourceType);
  
  const spaceAvailable = capacity - currentAmount;
  const amountToAdd = Math.min(amount, spaceAvailable);
  
  if (amountToAdd > 0) {
    storage.set(resourceType, currentAmount + amountToAdd);
  }
  
  return amountToAdd;
}

/**
 * Removes resources from a building's storage
 * Returns the amount actually removed (may be less than requested if not enough available)
 */
export function removeResourcesFromBuilding(
  building: BuildingEntity,
  resourceType: ResourceType,
  amount: number,
  isInput: boolean = true
): number {
  const storage = isInput ? building.inputStorage : building.outputStorage;
  const currentAmount = storage.get(resourceType) || 0;
  
  const amountToRemove = Math.min(amount, currentAmount);
  
  if (amountToRemove > 0) {
    const newAmount = currentAmount - amountToRemove;
    if (newAmount <= 0) {
      storage.delete(resourceType);
    } else {
      storage.set(resourceType, newAmount);
    }
  }
  
  return amountToRemove;
}

/**
 * Checks if a building has enough of a resource
 */
export function hasEnoughResources(
  building: BuildingEntity,
  resourceType: ResourceType,
  amount: number,
  isInput: boolean = true
): boolean {
  const storage = isInput ? building.inputStorage : building.outputStorage;
  const currentAmount = storage.get(resourceType) || 0;
  return currentAmount >= amount;
}

/**
 * Gets the current amount of a resource in storage
 */
export function getResourceAmount(
  building: BuildingEntity,
  resourceType: ResourceType,
  isInput: boolean = true
): number {
  const storage = isInput ? building.inputStorage : building.outputStorage;
  return storage.get(resourceType) || 0;
}

/**
 * Gets the available space for a resource
 */
export function getAvailableSpace(
  building: BuildingEntity,
  resourceType: ResourceType,
  isInput: boolean = true
): number {
  const currentAmount = getResourceAmount(building, resourceType, isInput);
  const capacity = getStorageCapacity(building, resourceType);
  return capacity - currentAmount;
}

/**
 * Transfers resources from one building to another
 * Returns the amount actually transferred
 */
export function transferResources(
  fromBuilding: BuildingEntity,
  toBuilding: BuildingEntity,
  resourceType: ResourceType,
  amount: number,
  fromIsInput: boolean = false,
  toIsInput: boolean = true
): number {
  const availableAmount = getResourceAmount(fromBuilding, resourceType, fromIsInput);
  const availableSpace = getAvailableSpace(toBuilding, resourceType, toIsInput);
  
  const amountToTransfer = Math.min(amount, availableAmount, availableSpace);
  
  if (amountToTransfer > 0) {
    removeResourcesFromBuilding(fromBuilding, resourceType, amountToTransfer, fromIsInput);
    addResourcesToBuilding(toBuilding, resourceType, amountToTransfer, toIsInput);
  }
  
  return amountToTransfer;
}

/**
 * Gets total resources across all buildings of a type
 * Useful for checking global resource availability
 */
export function getTotalResourcesInBuildings(
  buildings: BuildingEntity[],
  resourceType: ResourceType,
  isInput: boolean = false
): number {
  return buildings.reduce((total, building) => {
    return total + getResourceAmount(building, resourceType, isInput);
  }, 0);
}

/**
 * Finds buildings that have a specific resource available
 */
export function findBuildingsWithResource(
  buildings: BuildingEntity[],
  resourceType: ResourceType,
  minAmount: number = 1,
  isInput: boolean = false
): BuildingEntity[] {
  return buildings.filter(building => {
    const amount = getResourceAmount(building, resourceType, isInput);
    return amount >= minAmount;
  });
}

/**
 * Finds buildings that have space for a specific resource
 */
export function findBuildingsWithSpace(
  buildings: BuildingEntity[],
  resourceType: ResourceType,
  minSpace: number = 1,
  isInput: boolean = true
): BuildingEntity[] {
  return buildings.filter(building => {
    const space = getAvailableSpace(building, resourceType, isInput);
    return space >= minSpace;
  });
}
