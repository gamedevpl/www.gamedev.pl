/**
 * Constants for the building system.
 * Defines building types, dimensions, costs, and visual properties.
 */

import { FoodType } from '../food-types';

export const BuildingType = {
  StorageSpot: 'storageSpot',
  PlantingZone: 'plantingZone',
  BorderPost: 'borderPost',
  Bonfire: 'bonfire',
  Palisade: 'palisade',
  Gate: 'gate',
} as const;

export type BuildingType = (typeof BuildingType)[keyof typeof BuildingType];

interface BuildingDimensions {
  width: number;
  height: number;
}

interface BuildingCost {
  food?: { type: FoodType; amount: number }[];
  wood?: number;
}

// Default hitpoints for buildings (0 means indestructible via combat)
export const DEFAULT_BUILDING_HITPOINTS = 0;

// Palisade and Gate specific constants
export const PALISADE_HITPOINTS = 100;
export const GATE_HITPOINTS = 150;
export const PALISADE_GATE_GRID_SIZE = 20; // Matches territory grid resolution

// Building Definitions
export const BUILDING_DEFINITIONS: Record<
  BuildingType,
  {
    name: string;
    description: string;
    icon: string; // Emoji or sprite reference
    dimensions: BuildingDimensions;
    constructionTimeHours: number;
    destructionTimeHours: number;
    cost: BuildingCost;
    hitpoints?: number; // Optional hitpoints for destructible buildings
    blocksMovement?: boolean; // Whether this building blocks movement for all entities
    tribeMembersCanPass?: boolean; // Whether tribe members can pass through (for gates)
  }
> = {
  [BuildingType.StorageSpot]: {
    name: 'Storage Spot',
    description: 'A designated area for storing excess food.',
    icon: '📦',
    dimensions: { width: 40, height: 40 },
    constructionTimeHours: 0.1, // Near instant
    destructionTimeHours: 0.1,
    cost: {}, // Free for now
  },
  [BuildingType.PlantingZone]: {
    name: 'Planting Zone',
    description: 'An area marked for agricultural use.',
    icon: '🌾',
    dimensions: { width: 60, height: 60 },
    constructionTimeHours: 0.1, // Near instant
    destructionTimeHours: 0.1,
    cost: {}, // Free for now
  },
  [BuildingType.BorderPost]: {
    name: 'Border Post',
    description: 'A territorial marker that expands tribe borders',
    icon: '🚩',
    dimensions: { width: 40, height: 40 },
    constructionTimeHours: 0.2,
    destructionTimeHours: 0.1,
    cost: { wood: 2 },
  },
  [BuildingType.Bonfire]: {
    name: 'Bonfire',
    description: 'A shared tribe building that provides warmth.',
    icon: '🔥',
    dimensions: { width: 40, height: 40 },
    constructionTimeHours: 0.5,
    destructionTimeHours: 0.2,
    cost: { wood: 5 },
  },
  [BuildingType.Palisade]: {
    name: 'Palisade',
    description: 'A defensive wall that blocks all movement.',
    icon: '🪵',
    dimensions: { width: PALISADE_GATE_GRID_SIZE, height: PALISADE_GATE_GRID_SIZE },
    constructionTimeHours: 0.3,
    destructionTimeHours: 0.2,
    cost: { wood: 1 },
    hitpoints: PALISADE_HITPOINTS,
    blocksMovement: true,
    tribeMembersCanPass: false,
  },
  [BuildingType.Gate]: {
    name: 'Gate',
    description: 'A gate that allows passage only for tribe members.',
    icon: '🚪',
    dimensions: { width: PALISADE_GATE_GRID_SIZE, height: PALISADE_GATE_GRID_SIZE },
    constructionTimeHours: 0.4,
    destructionTimeHours: 0.2,
    cost: { wood: 3 },
    hitpoints: GATE_HITPOINTS,
    blocksMovement: true,
    tribeMembersCanPass: true,
  },
};

// Visual Constants
export const BUILDING_GHOST_OPACITY = 0.5;
export const BUILDING_CONSTRUCTION_BAR_COLOR = '#FFA500'; // Orange
export const BUILDING_DESTRUCTION_BAR_COLOR = '#FF4500'; // Red-Orange
export const BUILDING_PROGRESS_BAR_HEIGHT = 4;
export const BUILDING_PROGRESS_BAR_OFFSET = 10;
export const BORDER_EXPANSION_PAINT_RADIUS = 60; // Radius of territory claimed by pioneer

// Helper to get dimensions easily
export function getBuildingDimensions(type: BuildingType): BuildingDimensions {
  return BUILDING_DEFINITIONS[type].dimensions;
}

// Helper to get construction time
export function getBuildingConstructionTime(type: BuildingType): number {
  return BUILDING_DEFINITIONS[type].constructionTimeHours;
}

// Helper to get destruction time
export function getBuildingDestructionTime(type: BuildingType): number {
  return BUILDING_DEFINITIONS[type].destructionTimeHours;
}

// Helper to get building hitpoints
export function getBuildingHitpoints(type: BuildingType): number {
  return BUILDING_DEFINITIONS[type].hitpoints ?? DEFAULT_BUILDING_HITPOINTS;
}

// Helper to check if building blocks movement
export function doesBuildingBlockMovement(type: BuildingType): boolean {
  return BUILDING_DEFINITIONS[type].blocksMovement ?? false;
}

// Helper to check if tribe members can pass through
export function canTribeMembersPass(type: BuildingType): boolean {
  return BUILDING_DEFINITIONS[type].tribeMembersCanPass ?? false;
}
