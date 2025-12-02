/**
 * Building entity implementation
 * 
 * Buildings are entities that can be placed, constructed, operated, and demolished
 */

import { Entity, EntityId } from '../entities-types';
import { BuildingState, BuildingType, ResourceType } from '../../buildings/building-types';

/**
 * Building entity - extends base Entity interface
 */
export interface BuildingEntity extends Entity {
  type: 'building';
  buildingType: BuildingType;
  state: BuildingState;
  
  // Construction
  constructionProgress: number; // 0-100
  constructionStartTime?: number; // game time
  
  // Health
  health: number;
  maxHealth: number;
  
  // Workers
  assignedWorkerIds: EntityId[];
  maxWorkers: number;
  
  // Production
  inputStorage: Map<ResourceType, number>;
  outputStorage: Map<ResourceType, number>;
  productionProgress?: number; // 0-100, for production buildings
  
  // Ownership
  ownerId?: EntityId; // Tribe leader who owns this building
  
  // Demolition
  demolitionProgress?: number; // 0-100
  demolitionStartTime?: number; // game time
}

/**
 * Type guard to check if an entity is a building
 */
export function isBuildingEntity(entity: Entity): entity is BuildingEntity {
  return entity.type === 'building';
}
