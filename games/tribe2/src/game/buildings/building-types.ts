/**
 * Building types and definitions for Tribe2
 * 
 * This file defines all building types, states, and related data structures
 * according to the GAME_DESIGN.md document.
 */

import { EntityId } from '../entities/entities-types';
import { Vector2D } from '../utils/math-types';

/**
 * Building lifecycle states
 */
export enum BuildingState {
  Planned = 'Planned',
  UnderConstruction = 'UnderConstruction',
  Operational = 'Operational',
  Damaged = 'Damaged',
  MarkedForDemolition = 'MarkedForDemolition',
  BeingDemolished = 'BeingDemolished',
  Disappeared = 'Disappeared',
}

/**
 * Building categories for organization
 */
export enum BuildingCategory {
  Residential = 'Residential',
  ResourceStorage = 'ResourceStorage',
  FoodProduction = 'FoodProduction',
  WoodProduction = 'WoodProduction',
  Mining = 'Mining',
  MetalProduction = 'MetalProduction',
  Transportation = 'Transportation',
  Military = 'Military',
}

/**
 * All building types in the game
 */
export enum BuildingType {
  // Residential
  HQ = 'HQ',
  MinorHQ = 'MinorHQ',
  House = 'House',
  Kindergarten = 'Kindergarten',
  
  // Resource & Food Storage
  Warehouse = 'Warehouse',
  Tavern = 'Tavern',
  
  // Wood Production Chain
  ForestRangerHut = 'ForestRangerHut',
  LumberjackHut = 'LumberjackHut',
  Sawmill = 'Sawmill',
  
  // Mining & Stone
  QuarrymanHut = 'QuarrymanHut',
  
  // Food Production
  FishermanHut = 'FishermanHut',
  HunterHut = 'HunterHut',
  Farm = 'Farm',
  Windmill = 'Windmill',
  Bakery = 'Bakery',
  PigFarm = 'PigFarm',
  Butcher = 'Butcher',
  
  // Metal & Tool Production
  IronFoundry = 'IronFoundry',
  GoldFoundry = 'GoldFoundry',
  Blacksmith = 'Blacksmith',
  ToolMaker = 'ToolMaker',
  
  // Transportation
  ShipMaker = 'ShipMaker',
  
  // Military
  GuardTower = 'GuardTower',
  Garrison = 'Garrison',
  Barracks = 'Barracks',
}

/**
 * Terrain requirements for building placement
 */
export enum TerrainRequirement {
  Any = 'Any',
  NearWater = 'NearWater',
  OnWater = 'OnWater',
  NearMountain = 'NearMountain',
  OnGrass = 'OnGrass',
  NearForest = 'NearForest',
}

/**
 * Resource types that can be gathered, stored, and used
 */
export enum ResourceType {
  // Basic materials
  Wood = 'Wood',
  WoodPlanks = 'WoodPlanks',
  Stone = 'Stone',
  
  // Ores
  IronOre = 'IronOre',
  GoldOre = 'GoldOre',
  Coal = 'Coal',
  Granite = 'Granite',
  
  // Processed metals
  Iron = 'Iron',
  Gold = 'Gold',
  
  // Food (raw)
  Fish = 'Fish',
  Meat = 'Meat',
  Wheat = 'Wheat',
  
  // Food (processed)
  Flour = 'Flour',
  Bread = 'Bread',
  Sausage = 'Sausage',
  
  // Tools & Equipment
  Tools = 'Tools',
  Weapons = 'Weapons',
  
  // Animals
  Pigs = 'Pigs',
}

/**
 * Resource cost for building construction
 */
export interface ResourceCost {
  resourceType: ResourceType;
  amount: number;
}

/**
 * Building definition (template)
 */
export interface BuildingDefinition {
  type: BuildingType;
  category: BuildingCategory;
  name: string;
  description: string;
  
  // Placement requirements
  terrainRequirement: TerrainRequirement;
  minSpacing: number; // Minimum distance from other buildings
  
  // Construction requirements
  constructionCosts: ResourceCost[];
  constructionTime: number; // in game hours
  
  // Operational parameters
  maxWorkers: number;
  radius: number; // Building footprint radius
  
  // Resource production (if applicable)
  produces?: ResourceType[];
  consumes?: ResourceType[];
  productionRate?: number; // per game hour
  
  // Health
  maxHealth: number;
  
  // Demolition recovery (percentage of construction costs)
  demolitionRecoveryRate: number;
}

/**
 * Building entity instance
 */
export interface BuildingEntity {
  id: EntityId;
  type: BuildingType;
  position: Vector2D;
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
  
  // Ownership
  ownerId?: EntityId; // Tribe leader who owns this building
  
  // Demolition
  demolitionProgress?: number; // 0-100
  demolitionStartTime?: number; // game time
  
  // Building-specific data
  radius: number;
}

/**
 * Building context menu option
 */
export interface BuildingMenuOption {
  id: string;
  label: string;
  icon?: string;
  action: (building: BuildingEntity) => void;
  isEnabled?: (building: BuildingEntity) => boolean;
}

/**
 * Building placement validation result
 */
export interface PlacementValidation {
  isValid: boolean;
  reason?: string;
}
