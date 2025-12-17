/**
 * Constants for the building system.
 * Defines building types, dimensions, costs, and visual properties.
 */

import { FoodType } from '../food-types';

export const BuildingType = {
  StorageSpot: 'storageSpot',
  PlantingZone: 'plantingZone',
  BorderPost: 'borderPost',
} as const;

export type BuildingType = (typeof BuildingType)[keyof typeof BuildingType];

interface BuildingDimensions {
  width: number;
  height: number;
}

interface BuildingCost {
  food?: { type: FoodType; amount: number }[];
  // Future: wood, stone, etc.
}

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
    cost: {}, // Free for now
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
