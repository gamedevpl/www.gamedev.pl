/**
 * Job definitions - configuration data for all profession types
 * 
 * This file contains the complete configuration for each job/profession type
 * including building associations, requirements, and priorities.
 */

import {
  ProfessionType,
  JobDefinition,
  JobPriority,
} from './job-types';
import { BuildingType } from '../buildings/building-types';

/**
 * Complete job definitions database
 * Maps profession types to their full configuration
 */
export const JOB_DEFINITIONS: Record<ProfessionType, JobDefinition> = {
  [ProfessionType.None]: {
    profession: ProfessionType.None,
    name: 'Unemployed',
    description: 'Not assigned to any job.',
    buildingTypes: [],
    requiresAdult: false,
    priority: 0,
  },
  
  // === CONSTRUCTION & LOGISTICS ===
  
  [ProfessionType.BuildingConstructor]: {
    profession: ProfessionType.BuildingConstructor,
    name: 'Building Constructor',
    description: 'Constructs new buildings and repairs damaged ones.',
    buildingTypes: [], // Works anywhere there's construction
    requiresAdult: true,
    requiresTools: true,
    priority: JobPriority.High,
  },
  
  [ProfessionType.Carrier]: {
    profession: ProfessionType.Carrier,
    name: 'Carrier',
    description: 'Transports resources and goods between buildings.',
    buildingTypes: [BuildingType.Warehouse],
    requiresAdult: true,
    priority: JobPriority.High,
  },
  
  // === WOOD PRODUCTION ===
  
  [ProfessionType.Lumberjack]: {
    profession: ProfessionType.Lumberjack,
    name: 'Lumberjack',
    description: 'Chops trees and delivers wood.',
    buildingTypes: [BuildingType.LumberjackHut],
    requiresAdult: true,
    requiresTools: true,
    priority: JobPriority.Medium,
  },
  
  [ProfessionType.ForestRanger]: {
    profession: ProfessionType.ForestRanger,
    name: 'Forest Ranger',
    description: 'Plants new trees to ensure sustainable forestry.',
    buildingTypes: [BuildingType.ForestRangerHut],
    requiresAdult: true,
    priority: JobPriority.Low,
  },
  
  [ProfessionType.SawmillWorker]: {
    profession: ProfessionType.SawmillWorker,
    name: 'Sawmill Worker',
    description: 'Processes logs into wood planks.',
    buildingTypes: [BuildingType.Sawmill],
    requiresAdult: true,
    priority: JobPriority.Medium,
  },
  
  // === FOOD PRODUCTION ===
  
  [ProfessionType.Fisherman]: {
    profession: ProfessionType.Fisherman,
    name: 'Fisherman',
    description: 'Catches fish from water sources.',
    buildingTypes: [BuildingType.FishermanHut],
    requiresAdult: true,
    priority: JobPriority.Critical,
  },
  
  [ProfessionType.Hunter]: {
    profession: ProfessionType.Hunter,
    name: 'Hunter',
    description: 'Hunts prey animals for meat.',
    buildingTypes: [BuildingType.HunterHut],
    requiresAdult: true,
    requiresTools: true,
    priority: JobPriority.Critical,
  },
  
  [ProfessionType.Farmer]: {
    profession: ProfessionType.Farmer,
    name: 'Farmer',
    description: 'Plants and harvests wheat.',
    buildingTypes: [BuildingType.Farm],
    requiresAdult: true,
    requiresTools: true,
    priority: JobPriority.Critical,
  },
  
  [ProfessionType.WindmillWorker]: {
    profession: ProfessionType.WindmillWorker,
    name: 'Windmill Worker',
    description: 'Grinds wheat into flour.',
    buildingTypes: [BuildingType.Windmill],
    requiresAdult: true,
    priority: JobPriority.High,
  },
  
  [ProfessionType.Baker]: {
    profession: ProfessionType.Baker,
    name: 'Baker',
    description: 'Bakes bread from flour.',
    buildingTypes: [BuildingType.Bakery],
    requiresAdult: true,
    priority: JobPriority.High,
  },
  
  [ProfessionType.PigFarmer]: {
    profession: ProfessionType.PigFarmer,
    name: 'Pig Farmer',
    description: 'Raises pigs for meat production.',
    buildingTypes: [BuildingType.PigFarm],
    requiresAdult: true,
    priority: JobPriority.Medium,
  },
  
  [ProfessionType.Butcher]: {
    profession: ProfessionType.Butcher,
    name: 'Butcher',
    description: 'Processes meat into sausages.',
    buildingTypes: [BuildingType.Butcher],
    requiresAdult: true,
    requiresTools: true,
    priority: JobPriority.High,
  },
  
  // === MINING & METALWORK ===
  
  [ProfessionType.Quarryman]: {
    profession: ProfessionType.Quarryman,
    name: 'Quarryman',
    description: 'Quarries stone from mountains.',
    buildingTypes: [BuildingType.QuarrymanHut],
    requiresAdult: true,
    requiresTools: true,
    priority: JobPriority.Medium,
  },
  
  [ProfessionType.Miner]: {
    profession: ProfessionType.Miner,
    name: 'Miner',
    description: 'Mines valuable ores (iron, gold, coal).',
    buildingTypes: [BuildingType.QuarrymanHut],
    requiresAdult: true,
    requiresTools: true,
    priority: JobPriority.Medium,
  },
  
  [ProfessionType.IronFoundryWorker]: {
    profession: ProfessionType.IronFoundryWorker,
    name: 'Iron Foundry Worker',
    description: 'Smelts iron ore into iron bars.',
    buildingTypes: [BuildingType.IronFoundry],
    requiresAdult: true,
    priority: JobPriority.High,
  },
  
  [ProfessionType.GoldFoundryWorker]: {
    profession: ProfessionType.GoldFoundryWorker,
    name: 'Gold Foundry Worker',
    description: 'Smelts gold ore into gold.',
    buildingTypes: [BuildingType.GoldFoundry],
    requiresAdult: true,
    priority: JobPriority.Low,
  },
  
  [ProfessionType.Blacksmith]: {
    profession: ProfessionType.Blacksmith,
    name: 'Blacksmith',
    description: 'Forges weapons from iron.',
    buildingTypes: [BuildingType.Blacksmith],
    requiresAdult: true,
    priority: JobPriority.High,
  },
  
  [ProfessionType.ToolMaker]: {
    profession: ProfessionType.ToolMaker,
    name: 'Tool Maker',
    description: 'Creates tools for workers and construction.',
    buildingTypes: [BuildingType.ToolMaker],
    requiresAdult: true,
    priority: JobPriority.High,
  },
  
  // === SERVICE & MILITARY ===
  
  [ProfessionType.TavernWorker]: {
    profession: ProfessionType.TavernWorker,
    name: 'Tavern Worker',
    description: 'Serves food and maintains the tavern.',
    buildingTypes: [BuildingType.Tavern],
    requiresAdult: true,
    priority: JobPriority.Medium,
  },
  
  [ProfessionType.KindergartenCaretaker]: {
    profession: ProfessionType.KindergartenCaretaker,
    name: 'Kindergarten Caretaker',
    description: 'Takes care of infants while parents work.',
    buildingTypes: [BuildingType.Kindergarten],
    requiresAdult: true,
    priority: JobPriority.Medium,
  },
  
  [ProfessionType.Guard]: {
    profession: ProfessionType.Guard,
    name: 'Guard',
    description: 'Defends territory and patrols borders.',
    buildingTypes: [BuildingType.GuardTower],
    requiresAdult: true,
    requiresTools: true, // Needs weapons
    priority: JobPriority.Critical,
  },
  
  [ProfessionType.Soldier]: {
    profession: ProfessionType.Soldier,
    name: 'Soldier',
    description: 'Military unit for defense and offense.',
    buildingTypes: [BuildingType.Garrison, BuildingType.Barracks],
    requiresAdult: true,
    requiresTools: true, // Needs weapons
    priority: JobPriority.Critical,
  },
  
  // === TRANSPORTATION ===
  
  [ProfessionType.ShipMaker]: {
    profession: ProfessionType.ShipMaker,
    name: 'Ship Maker',
    description: 'Builds ships for water transportation.',
    buildingTypes: [BuildingType.ShipMaker],
    requiresAdult: true,
    requiresTools: true,
    priority: JobPriority.Low,
  },
};

/**
 * Helper function to get job definition by profession type
 */
export function getJobDefinition(profession: ProfessionType): JobDefinition {
  return JOB_DEFINITIONS[profession];
}

/**
 * Helper function to get all jobs that can work at a specific building
 */
export function getJobsForBuilding(buildingType: BuildingType): JobDefinition[] {
  return Object.values(JOB_DEFINITIONS).filter(
    (def) => def.buildingTypes.includes(buildingType)
  );
}

/**
 * Helper function to get all jobs sorted by priority
 */
export function getJobsSortedByPriority(): JobDefinition[] {
  return Object.values(JOB_DEFINITIONS)
    .filter((def) => def.profession !== ProfessionType.None)
    .sort((a, b) => b.priority - a.priority);
}
