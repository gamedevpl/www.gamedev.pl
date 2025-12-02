/**
 * Job and profession system for Tribe2
 * 
 * Defines all job types, AI states, and job assignment logic
 * according to the GAME_DESIGN.md document.
 */

import { EntityId } from '../entities/entities-types';
import { BuildingType } from '../buildings/building-types';

/**
 * All profession/job types in the game
 */
export enum ProfessionType {
  // No profession (unemployed)
  None = 'None',
  
  // Construction & Logistics
  BuildingConstructor = 'BuildingConstructor',
  Carrier = 'Carrier',
  
  // Wood Production
  Lumberjack = 'Lumberjack',
  ForestRanger = 'ForestRanger',
  SawmillWorker = 'SawmillWorker',
  
  // Food Production
  Fisherman = 'Fisherman',
  Hunter = 'Hunter',
  Farmer = 'Farmer',
  WindmillWorker = 'WindmillWorker',
  Baker = 'Baker',
  PigFarmer = 'PigFarmer',
  Butcher = 'Butcher',
  
  // Mining & Metalwork
  Quarryman = 'Quarryman',
  Miner = 'Miner',
  IronFoundryWorker = 'IronFoundryWorker',
  GoldFoundryWorker = 'GoldFoundryWorker',
  Blacksmith = 'Blacksmith',
  ToolMaker = 'ToolMaker',
  
  // Service & Military
  TavernWorker = 'TavernWorker',
  KindergartenCaretaker = 'KindergartenCaretaker',
  Guard = 'Guard',
  Soldier = 'Soldier',
  
  // Transportation
  ShipMaker = 'ShipMaker',
}

/**
 * Job AI states for behavior trees
 * These are the states that workers can be in while performing their jobs
 */
export enum JobState {
  // Common states
  Idle = 'Idle',
  Resting = 'Resting',
  
  // Constructor states
  GatheringResources = 'GatheringResources',
  Constructing = 'Constructing',
  
  // Carrier states
  PickingUp = 'PickingUp',
  Carrying = 'Carrying',
  Delivering = 'Delivering',
  
  // Lumberjack states
  WalkingToTree = 'WalkingToTree',
  Chopping = 'Chopping',
  CarryingWood = 'CarryingWood',
  
  // Forest Ranger states
  WalkingToPlantSite = 'WalkingToPlantSite',
  Planting = 'Planting',
  
  // Production worker states
  Processing = 'Processing',
  Stocking = 'Stocking',
  
  // Fisherman states
  WalkingToWater = 'WalkingToWater',
  Fishing = 'Fishing',
  CarryingFish = 'CarryingFish',
  
  // Hunter states
  Tracking = 'Tracking',
  Hunting = 'Hunting',
  CarryingMeat = 'CarryingMeat',
  
  // Farmer states
  Tilling = 'Tilling',
  Watering = 'Watering',
  Harvesting = 'Harvesting',
  
  // Pig Farmer states
  Feeding = 'Feeding',
  Slaughtering = 'Slaughtering',
  
  // Miner states
  WalkingToMine = 'WalkingToMine',
  Mining = 'Mining',
  CarryingOre = 'CarryingOre',
  
  // Blacksmith/Tool Maker states
  Forging = 'Forging',
  Crafting = 'Crafting',
  
  // Service worker states
  Serving = 'Serving',
  Cleaning = 'Cleaning',
  Supervising = 'Supervising',
  
  // Military states
  Patrolling = 'Patrolling',
  Fighting = 'Fighting',
  Training = 'Training',
  Defending = 'Defending',
}

/**
 * Job assignment data for a human
 */
export interface JobAssignment {
  profession: ProfessionType;
  buildingId?: EntityId; // The building where this person works (if applicable)
  assignedTime: number; // Game time when assigned
  
  // Job state for AI
  currentState?: JobState;
  stateData?: Record<string, any>; // State-specific data
}

/**
 * Job definition (template)
 */
export interface JobDefinition {
  profession: ProfessionType;
  name: string;
  description: string;
  
  // Building association
  buildingTypes: BuildingType[]; // Buildings where this job can work
  
  // Requirements
  requiresAdult: boolean;
  requiresTools?: boolean;
  
  // Priority (higher = more critical)
  priority: number;
}

/**
 * Job assignment priority system
 */
export enum JobPriority {
  Critical = 100, // Food production, defense
  High = 75,      // Construction, tools
  Medium = 50,    // Wood, mining
  Low = 25,       // Services, luxury production
}

/**
 * Family tradition tracking
 * Children usually follow their parents' profession
 */
export interface FamilyTradition {
  professionType: ProfessionType;
  generations: number; // How many generations have followed this profession
}
