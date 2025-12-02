/**
 * Building definitions - configuration data for all building types
 * 
 * This file contains the complete configuration for each building type
 * including costs, requirements, and production parameters.
 */

import {
  BuildingType,
  BuildingCategory,
  BuildingDefinition,
  TerrainRequirement,
  ResourceType,
} from './building-types';

/**
 * Complete building definitions database
 * Maps building types to their full configuration
 */
export const BUILDING_DEFINITIONS: Record<BuildingType, BuildingDefinition> = {
  // === RESIDENTIAL BUILDINGS ===
  
  [BuildingType.HQ]: {
    type: BuildingType.HQ,
    category: BuildingCategory.Residential,
    name: 'Headquarters',
    description: 'Where the tribe leader lives. The main base that cannot be destroyed.',
    terrainRequirement: TerrainRequirement.Any,
    minSpacing: 30,
    constructionCosts: [
      { resourceType: ResourceType.Wood, amount: 50 },
      { resourceType: ResourceType.Stone, amount: 100 },
    ],
    constructionTime: 24, // 24 game hours
    maxWorkers: 0, // No workers needed
    radius: 25,
    maxHealth: 1000,
    demolitionRecoveryRate: 0, // Cannot be demolished
  },
  
  [BuildingType.MinorHQ]: {
    type: BuildingType.MinorHQ,
    category: BuildingCategory.Residential,
    name: 'Minor Headquarters',
    description: 'Where important tribe members live (heirs, parents of large families).',
    terrainRequirement: TerrainRequirement.Any,
    minSpacing: 20,
    constructionCosts: [
      { resourceType: ResourceType.Wood, amount: 30 },
      { resourceType: ResourceType.Stone, amount: 50 },
    ],
    constructionTime: 16,
    maxWorkers: 0,
    radius: 18,
    maxHealth: 500,
    demolitionRecoveryRate: 0.5,
  },
  
  [BuildingType.House]: {
    type: BuildingType.House,
    category: BuildingCategory.Residential,
    name: 'House',
    description: 'Where a single family lives.',
    terrainRequirement: TerrainRequirement.Any,
    minSpacing: 15,
    constructionCosts: [
      { resourceType: ResourceType.Wood, amount: 20 },
      { resourceType: ResourceType.Stone, amount: 15 },
    ],
    constructionTime: 8,
    maxWorkers: 0,
    radius: 12,
    maxHealth: 200,
    demolitionRecoveryRate: 0.6,
  },
  
  [BuildingType.Kindergarten]: {
    type: BuildingType.Kindergarten,
    category: BuildingCategory.Residential,
    name: 'Kindergarten',
    description: 'Where infants can stay while parents are busy.',
    terrainRequirement: TerrainRequirement.Any,
    minSpacing: 15,
    constructionCosts: [
      { resourceType: ResourceType.WoodPlanks, amount: 15 },
      { resourceType: ResourceType.Stone, amount: 10 },
    ],
    constructionTime: 6,
    maxWorkers: 2,
    radius: 15,
    maxHealth: 150,
    demolitionRecoveryRate: 0.6,
  },
  
  // === RESOURCE STORAGE ===
  
  [BuildingType.Warehouse]: {
    type: BuildingType.Warehouse,
    category: BuildingCategory.ResourceStorage,
    name: 'Warehouse',
    description: 'Where resources are stored.',
    terrainRequirement: TerrainRequirement.Any,
    minSpacing: 20,
    constructionCosts: [
      { resourceType: ResourceType.WoodPlanks, amount: 30 },
      { resourceType: ResourceType.Stone, amount: 40 },
    ],
    constructionTime: 12,
    maxWorkers: 2, // Warehouse keepers
    radius: 20,
    maxHealth: 300,
    demolitionRecoveryRate: 0.7,
  },
  
  [BuildingType.Tavern]: {
    type: BuildingType.Tavern,
    category: BuildingCategory.ResourceStorage,
    name: 'Tavern',
    description: 'Where tribe members can eat.',
    terrainRequirement: TerrainRequirement.Any,
    minSpacing: 15,
    constructionCosts: [
      { resourceType: ResourceType.WoodPlanks, amount: 25 },
      { resourceType: ResourceType.Stone, amount: 20 },
    ],
    constructionTime: 10,
    maxWorkers: 2,
    radius: 18,
    maxHealth: 200,
    demolitionRecoveryRate: 0.6,
  },
  
  // === WOOD PRODUCTION ===
  
  [BuildingType.ForestRangerHut]: {
    type: BuildingType.ForestRangerHut,
    category: BuildingCategory.WoodProduction,
    name: 'Forest Ranger\'s Hut',
    description: 'Replants trees to ensure sustainable wood supply.',
    terrainRequirement: TerrainRequirement.NearForest,
    minSpacing: 25,
    constructionCosts: [
      { resourceType: ResourceType.Wood, amount: 15 },
      { resourceType: ResourceType.Stone, amount: 10 },
    ],
    constructionTime: 6,
    maxWorkers: 2,
    radius: 12,
    maxHealth: 150,
    demolitionRecoveryRate: 0.5,
  },
  
  [BuildingType.LumberjackHut]: {
    type: BuildingType.LumberjackHut,
    category: BuildingCategory.WoodProduction,
    name: 'Lumberjack\'s Hut',
    description: 'Gathers wood, a primary building material.',
    terrainRequirement: TerrainRequirement.NearForest,
    minSpacing: 25,
    constructionCosts: [
      { resourceType: ResourceType.Wood, amount: 15 },
      { resourceType: ResourceType.Stone, amount: 10 },
    ],
    constructionTime: 6,
    maxWorkers: 3,
    radius: 12,
    produces: [ResourceType.Wood],
    productionRate: 2, // 2 wood per hour per worker
    maxHealth: 150,
    demolitionRecoveryRate: 0.5,
  },
  
  [BuildingType.Sawmill]: {
    type: BuildingType.Sawmill,
    category: BuildingCategory.WoodProduction,
    name: 'Sawmill',
    description: 'Processes raw wood into valuable wood planks.',
    terrainRequirement: TerrainRequirement.Any,
    minSpacing: 20,
    constructionCosts: [
      { resourceType: ResourceType.Wood, amount: 30 },
      { resourceType: ResourceType.Stone, amount: 25 },
      { resourceType: ResourceType.Tools, amount: 2 },
    ],
    constructionTime: 10,
    maxWorkers: 2,
    radius: 16,
    consumes: [ResourceType.Wood],
    produces: [ResourceType.WoodPlanks],
    productionRate: 1.5, // 1.5 planks per hour per worker
    maxHealth: 200,
    demolitionRecoveryRate: 0.6,
  },
  
  // === MINING ===
  
  [BuildingType.QuarrymanHut]: {
    type: BuildingType.QuarrymanHut,
    category: BuildingCategory.Mining,
    name: 'Quarryman\'s Hut',
    description: 'Gathers stone or mines various ores (iron, gold, coal, granite).',
    terrainRequirement: TerrainRequirement.NearMountain,
    minSpacing: 30,
    constructionCosts: [
      { resourceType: ResourceType.Wood, amount: 20 },
      { resourceType: ResourceType.Stone, amount: 15 },
      { resourceType: ResourceType.Tools, amount: 2 },
    ],
    constructionTime: 8,
    maxWorkers: 4,
    radius: 14,
    produces: [ResourceType.Stone, ResourceType.IronOre, ResourceType.GoldOre, ResourceType.Coal, ResourceType.Granite],
    productionRate: 1.5, // 1.5 units per hour per worker
    maxHealth: 200,
    demolitionRecoveryRate: 0.5,
  },
  
  // === FOOD PRODUCTION ===
  
  [BuildingType.FishermanHut]: {
    type: BuildingType.FishermanHut,
    category: BuildingCategory.FoodProduction,
    name: 'Fisherman\'s Hut',
    description: 'Provides food from the water.',
    terrainRequirement: TerrainRequirement.NearWater,
    minSpacing: 20,
    constructionCosts: [
      { resourceType: ResourceType.Wood, amount: 15 },
      { resourceType: ResourceType.Stone, amount: 8 },
    ],
    constructionTime: 6,
    maxWorkers: 2,
    radius: 12,
    produces: [ResourceType.Fish],
    productionRate: 3, // 3 fish per hour per worker
    maxHealth: 150,
    demolitionRecoveryRate: 0.5,
  },
  
  [BuildingType.HunterHut]: {
    type: BuildingType.HunterHut,
    category: BuildingCategory.FoodProduction,
    name: 'Hunter\'s Hut',
    description: 'Produces meat.',
    terrainRequirement: TerrainRequirement.Any,
    minSpacing: 25,
    constructionCosts: [
      { resourceType: ResourceType.Wood, amount: 15 },
      { resourceType: ResourceType.Stone, amount: 10 },
    ],
    constructionTime: 6,
    maxWorkers: 3,
    radius: 12,
    produces: [ResourceType.Meat],
    productionRate: 2, // 2 meat per hour per worker
    maxHealth: 150,
    demolitionRecoveryRate: 0.5,
  },
  
  [BuildingType.Farm]: {
    type: BuildingType.Farm,
    category: BuildingCategory.FoodProduction,
    name: 'Farm',
    description: 'Grows wheat for bread production.',
    terrainRequirement: TerrainRequirement.OnGrass,
    minSpacing: 30,
    constructionCosts: [
      { resourceType: ResourceType.Wood, amount: 20 },
      { resourceType: ResourceType.Stone, amount: 10 },
      { resourceType: ResourceType.Tools, amount: 1 },
    ],
    constructionTime: 8,
    maxWorkers: 3,
    radius: 20,
    produces: [ResourceType.Wheat],
    productionRate: 2.5, // 2.5 wheat per hour per worker
    maxHealth: 150,
    demolitionRecoveryRate: 0.6,
  },
  
  [BuildingType.Windmill]: {
    type: BuildingType.Windmill,
    category: BuildingCategory.FoodProduction,
    name: 'Windmill',
    description: 'Grinds wheat into flour.',
    terrainRequirement: TerrainRequirement.Any,
    minSpacing: 25,
    constructionCosts: [
      { resourceType: ResourceType.WoodPlanks, amount: 30 },
      { resourceType: ResourceType.Stone, amount: 40 },
      { resourceType: ResourceType.Tools, amount: 3 },
    ],
    constructionTime: 14,
    maxWorkers: 2,
    radius: 18,
    consumes: [ResourceType.Wheat],
    produces: [ResourceType.Flour],
    productionRate: 2, // 2 flour per hour per worker
    maxHealth: 250,
    demolitionRecoveryRate: 0.6,
  },
  
  [BuildingType.Bakery]: {
    type: BuildingType.Bakery,
    category: BuildingCategory.FoodProduction,
    name: 'Bakery',
    description: 'Bakes bread from flour.',
    terrainRequirement: TerrainRequirement.Any,
    minSpacing: 15,
    constructionCosts: [
      { resourceType: ResourceType.WoodPlanks, amount: 20 },
      { resourceType: ResourceType.Stone, amount: 25 },
      { resourceType: ResourceType.Tools, amount: 2 },
    ],
    constructionTime: 10,
    maxWorkers: 2,
    radius: 14,
    consumes: [ResourceType.Flour],
    produces: [ResourceType.Bread],
    productionRate: 2.5, // 2.5 bread per hour per worker
    maxHealth: 200,
    demolitionRecoveryRate: 0.6,
  },
  
  [BuildingType.PigFarm]: {
    type: BuildingType.PigFarm,
    category: BuildingCategory.FoodProduction,
    name: 'Pig Farm',
    description: 'Raises pigs for meat production.',
    terrainRequirement: TerrainRequirement.OnGrass,
    minSpacing: 25,
    constructionCosts: [
      { resourceType: ResourceType.Wood, amount: 25 },
      { resourceType: ResourceType.Stone, amount: 15 },
    ],
    constructionTime: 10,
    maxWorkers: 2,
    radius: 18,
    produces: [ResourceType.Pigs],
    productionRate: 1, // 1 pig per hour per worker
    maxHealth: 180,
    demolitionRecoveryRate: 0.5,
  },
  
  [BuildingType.Butcher]: {
    type: BuildingType.Butcher,
    category: BuildingCategory.FoodProduction,
    name: 'Butcher',
    description: 'Processes meat into sausages.',
    terrainRequirement: TerrainRequirement.Any,
    minSpacing: 15,
    constructionCosts: [
      { resourceType: ResourceType.WoodPlanks, amount: 15 },
      { resourceType: ResourceType.Stone, amount: 20 },
      { resourceType: ResourceType.Tools, amount: 2 },
    ],
    constructionTime: 8,
    maxWorkers: 2,
    radius: 14,
    consumes: [ResourceType.Pigs, ResourceType.Meat],
    produces: [ResourceType.Sausage],
    productionRate: 2, // 2 sausages per hour per worker
    maxHealth: 180,
    demolitionRecoveryRate: 0.6,
  },
  
  // === METAL & TOOL PRODUCTION ===
  
  [BuildingType.IronFoundry]: {
    type: BuildingType.IronFoundry,
    category: BuildingCategory.MetalProduction,
    name: 'Iron Foundry',
    description: 'Smelts iron ore into iron.',
    terrainRequirement: TerrainRequirement.Any,
    minSpacing: 20,
    constructionCosts: [
      { resourceType: ResourceType.Stone, amount: 50 },
      { resourceType: ResourceType.WoodPlanks, amount: 20 },
      { resourceType: ResourceType.Tools, amount: 3 },
    ],
    constructionTime: 16,
    maxWorkers: 2,
    radius: 16,
    consumes: [ResourceType.IronOre, ResourceType.Coal],
    produces: [ResourceType.Iron],
    productionRate: 1, // 1 iron per hour per worker
    maxHealth: 300,
    demolitionRecoveryRate: 0.7,
  },
  
  [BuildingType.GoldFoundry]: {
    type: BuildingType.GoldFoundry,
    category: BuildingCategory.MetalProduction,
    name: 'Gold Foundry',
    description: 'Processes gold ore into gold for the treasury.',
    terrainRequirement: TerrainRequirement.Any,
    minSpacing: 20,
    constructionCosts: [
      { resourceType: ResourceType.Stone, amount: 50 },
      { resourceType: ResourceType.WoodPlanks, amount: 20 },
      { resourceType: ResourceType.Tools, amount: 3 },
    ],
    constructionTime: 16,
    maxWorkers: 2,
    radius: 16,
    consumes: [ResourceType.GoldOre, ResourceType.Coal],
    produces: [ResourceType.Gold],
    productionRate: 0.5, // 0.5 gold per hour per worker (more valuable)
    maxHealth: 300,
    demolitionRecoveryRate: 0.7,
  },
  
  [BuildingType.Blacksmith]: {
    type: BuildingType.Blacksmith,
    category: BuildingCategory.MetalProduction,
    name: 'Blacksmith',
    description: 'Forges tools and weapons from iron.',
    terrainRequirement: TerrainRequirement.Any,
    minSpacing: 15,
    constructionCosts: [
      { resourceType: ResourceType.Stone, amount: 30 },
      { resourceType: ResourceType.WoodPlanks, amount: 25 },
      { resourceType: ResourceType.Tools, amount: 3 },
    ],
    constructionTime: 12,
    maxWorkers: 2,
    radius: 15,
    consumes: [ResourceType.Iron, ResourceType.Coal],
    produces: [ResourceType.Weapons],
    productionRate: 0.8, // 0.8 weapons per hour per worker
    maxHealth: 250,
    demolitionRecoveryRate: 0.7,
  },
  
  [BuildingType.ToolMaker]: {
    type: BuildingType.ToolMaker,
    category: BuildingCategory.MetalProduction,
    name: 'Tool Maker\'s Shop',
    description: 'Creates tools required for advanced buildings and settlers.',
    terrainRequirement: TerrainRequirement.Any,
    minSpacing: 15,
    constructionCosts: [
      { resourceType: ResourceType.Stone, amount: 25 },
      { resourceType: ResourceType.WoodPlanks, amount: 20 },
      { resourceType: ResourceType.Iron, amount: 5 },
    ],
    constructionTime: 12,
    maxWorkers: 2,
    radius: 14,
    consumes: [ResourceType.Iron, ResourceType.Wood],
    produces: [ResourceType.Tools],
    productionRate: 1, // 1 tool per hour per worker
    maxHealth: 220,
    demolitionRecoveryRate: 0.7,
  },
  
  // === TRANSPORTATION ===
  
  [BuildingType.ShipMaker]: {
    type: BuildingType.ShipMaker,
    category: BuildingCategory.Transportation,
    name: 'Ship Maker\'s Shop',
    description: 'Produces ships to transport settlers and goods across water.',
    terrainRequirement: TerrainRequirement.NearWater,
    minSpacing: 25,
    constructionCosts: [
      { resourceType: ResourceType.WoodPlanks, amount: 40 },
      { resourceType: ResourceType.Iron, amount: 10 },
      { resourceType: ResourceType.Tools, amount: 4 },
    ],
    constructionTime: 18,
    maxWorkers: 3,
    radius: 20,
    consumes: [ResourceType.WoodPlanks, ResourceType.Iron],
    productionRate: 0.2, // 0.2 ships per hour (very slow, ships are valuable)
    maxHealth: 300,
    demolitionRecoveryRate: 0.6,
  },
  
  // === MILITARY ===
  
  [BuildingType.GuardTower]: {
    type: BuildingType.GuardTower,
    category: BuildingCategory.Military,
    name: 'Guard Tower',
    description: 'Basic military building that stations soldiers and expands controlled territory.',
    terrainRequirement: TerrainRequirement.Any,
    minSpacing: 30,
    constructionCosts: [
      { resourceType: ResourceType.WoodPlanks, amount: 20 },
      { resourceType: ResourceType.Stone, amount: 40 },
    ],
    constructionTime: 10,
    maxWorkers: 2,
    radius: 15,
    maxHealth: 400,
    demolitionRecoveryRate: 0.5,
  },
  
  [BuildingType.Garrison]: {
    type: BuildingType.Garrison,
    category: BuildingCategory.Military,
    name: 'Garrison',
    description: 'Larger military building that can house more soldiers.',
    terrainRequirement: TerrainRequirement.Any,
    minSpacing: 35,
    constructionCosts: [
      { resourceType: ResourceType.WoodPlanks, amount: 40 },
      { resourceType: ResourceType.Stone, amount: 80 },
      { resourceType: ResourceType.Iron, amount: 10 },
    ],
    constructionTime: 20,
    maxWorkers: 6,
    radius: 22,
    maxHealth: 600,
    demolitionRecoveryRate: 0.6,
  },
  
  [BuildingType.Barracks]: {
    type: BuildingType.Barracks,
    category: BuildingCategory.Military,
    name: 'Barracks',
    description: 'Training facility for soldiers.',
    terrainRequirement: TerrainRequirement.Any,
    minSpacing: 25,
    constructionCosts: [
      { resourceType: ResourceType.WoodPlanks, amount: 30 },
      { resourceType: ResourceType.Stone, amount: 50 },
      { resourceType: ResourceType.Tools, amount: 2 },
    ],
    constructionTime: 14,
    maxWorkers: 4,
    radius: 18,
    maxHealth: 350,
    demolitionRecoveryRate: 0.6,
  },
};

/**
 * Helper function to get building definition by type
 */
export function getBuildingDefinition(type: BuildingType): BuildingDefinition {
  return BUILDING_DEFINITIONS[type];
}

/**
 * Helper function to get all buildings of a specific category
 */
export function getBuildingsByCategory(category: BuildingCategory): BuildingDefinition[] {
  return Object.values(BUILDING_DEFINITIONS).filter(
    (def) => def.category === category
  );
}
