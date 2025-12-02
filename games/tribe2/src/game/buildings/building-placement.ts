/**
 * Building placement validation and utilities
 * 
 * Handles validation of building placement based on terrain, spacing, and other requirements
 */

import { Vector2D } from '../utils/math-types';
import { BuildingType, PlacementValidation, TerrainRequirement } from './building-types';
import { getBuildingDefinition } from './building-definitions';
import { IndexedWorldState } from '../world-index/world-index-types';

/**
 * Validates if a building can be placed at the given position
 */
export function validateBuildingPlacement(
  worldState: IndexedWorldState,
  buildingType: BuildingType,
  position: Vector2D,
): PlacementValidation {
  const definition = getBuildingDefinition(buildingType);
  
  // Check terrain requirements
  const terrainValid = validateTerrainRequirement(
    worldState,
    position,
    definition.terrainRequirement,
    definition.radius,
  );
  
  if (!terrainValid.isValid) {
    return terrainValid;
  }
  
  // Check spacing from other buildings
  const spacingValid = validateBuildingSpacing(
    worldState,
    position,
    definition.minSpacing,
    definition.radius,
  );
  
  if (!spacingValid.isValid) {
    return spacingValid;
  }
  
  // Check if within map bounds
  const boundsValid = validateMapBounds(
    worldState,
    position,
    definition.radius,
  );
  
  if (!boundsValid.isValid) {
    return boundsValid;
  }
  
  return { isValid: true };
}

/**
 * Validates terrain requirements for building placement
 */
function validateTerrainRequirement(
  _worldState: IndexedWorldState,
  _position: Vector2D,
  requirement: TerrainRequirement,
  _radius: number,
): PlacementValidation {
  // For now, we'll implement basic validation
  // TODO: Implement actual terrain checking when terrain system is available
  
  switch (requirement) {
    case TerrainRequirement.Any:
      return { isValid: true };
      
    case TerrainRequirement.NearWater:
      // TODO: Check if there's water within a certain distance
      return { isValid: true }; // Placeholder
      
    case TerrainRequirement.OnWater:
      // TODO: Check if the position is on water
      return { isValid: true }; // Placeholder
      
    case TerrainRequirement.NearMountain:
      // TODO: Check if there's a mountain nearby
      return { isValid: true }; // Placeholder
      
    case TerrainRequirement.OnGrass:
      // TODO: Check if the terrain is grass (not sand/water)
      return { isValid: true }; // Placeholder
      
    case TerrainRequirement.NearForest:
      // TODO: Check if there are trees nearby
      return { isValid: true }; // Placeholder
      
    default:
      return { isValid: true };
  }
}

/**
 * Validates spacing from other buildings
 */
function validateBuildingSpacing(
  worldState: IndexedWorldState,
  position: Vector2D,
  minSpacing: number,
  buildingRadius: number,
): PlacementValidation {
  // Search for nearby buildings
  const nearbyBuildings = worldState.search.building.byRadius(position, minSpacing + buildingRadius);
  
  if (nearbyBuildings.length > 0) {
    return {
      isValid: false,
      reason: 'Too close to another building',
    };
  }
  
  return { isValid: true };
}

/**
 * Validates that the building is within map bounds
 */
function validateMapBounds(
  worldState: IndexedWorldState,
  position: Vector2D,
  radius: number,
): PlacementValidation {
  const { width, height } = worldState.mapDimensions;
  
  if (
    position.x - radius < 0 ||
    position.x + radius > width ||
    position.y - radius < 0 ||
    position.y + radius > height
  ) {
    return {
      isValid: false,
      reason: 'Building would be outside map bounds',
    };
  }
  
  return { isValid: true };
}

/**
 * Calculates a preview position for building placement based on mouse position
 * Snaps to grid for better alignment
 */
export function calculateBuildingPreviewPosition(
  mouseWorldPos: Vector2D,
  gridSize: number = 10,
): Vector2D {
  return {
    x: Math.round(mouseWorldPos.x / gridSize) * gridSize,
    y: Math.round(mouseWorldPos.y / gridSize) * gridSize,
  };
}
