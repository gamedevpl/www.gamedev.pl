/**
 * Building placement input handlers
 * 
 * Handles user input for building placement, demolition, and building interaction
 */

import { GameWorldState } from '../world-types';
import { Vector2D } from '../utils/math-types';
import { BuildingType } from '../buildings/building-types';
import { validateBuildingPlacement, calculateBuildingPreviewPosition } from '../buildings/building-placement';
import { IndexedWorldState } from '../world-index/world-index-types';
import { getBuildingDefinition } from '../buildings/building-definitions';
import { BuildingEntity } from '../entities/buildings/building-entity';
import { BuildingState } from '../buildings/building-types';
import { addResourcesToBuilding } from '../resources/resource-management';

/**
 * Toggles building placement mode on/off
 */
export function toggleBuildingPlacementMode(gameState: GameWorldState): void {
  gameState.buildingPlacementMode = !gameState.buildingPlacementMode;
  
  // Exit demolish mode if entering building mode
  if (gameState.buildingPlacementMode) {
    gameState.demolishMode = false;
    // Select HQ as default building type if none selected
    if (!gameState.selectedBuildingType) {
      gameState.selectedBuildingType = BuildingType.HQ;
    }
  }
  
  // Clear preview if exiting building mode
  if (!gameState.buildingPlacementMode) {
    gameState.selectedBuildingType = undefined;
    gameState.buildingPreviewPosition = undefined;
    gameState.buildingPreviewValid = undefined;
  }
}

/**
 * Toggles demolish mode on/off
 */
export function toggleDemolishMode(gameState: GameWorldState): void {
  gameState.demolishMode = !gameState.demolishMode;
  
  // Exit building mode if entering demolish mode
  if (gameState.demolishMode) {
    gameState.buildingPlacementMode = false;
    gameState.selectedBuildingType = undefined;
    gameState.buildingPreviewPosition = undefined;
    gameState.buildingPreviewValid = undefined;
  }
}

/**
 * Selects a building type for placement
 */
export function selectBuildingType(gameState: GameWorldState, buildingType: BuildingType): void {
  gameState.selectedBuildingType = buildingType;
  gameState.buildingPlacementMode = true;
  gameState.demolishMode = false;
}

/**
 * Cycles to the next building type
 */
export function cycleNextBuildingType(gameState: GameWorldState): void {
  if (!gameState.buildingPlacementMode) {
    gameState.buildingPlacementMode = true;
    gameState.selectedBuildingType = BuildingType.HQ;
    return;
  }
  
  const buildingTypes = Object.values(BuildingType);
  const currentIndex = gameState.selectedBuildingType 
    ? buildingTypes.indexOf(gameState.selectedBuildingType)
    : -1;
  
  const nextIndex = (currentIndex + 1) % buildingTypes.length;
  gameState.selectedBuildingType = buildingTypes[nextIndex];
}

/**
 * Cycles to the previous building type
 */
export function cyclePreviousBuildingType(gameState: GameWorldState): void {
  if (!gameState.buildingPlacementMode) {
    gameState.buildingPlacementMode = true;
    gameState.selectedBuildingType = BuildingType.HQ;
    return;
  }
  
  const buildingTypes = Object.values(BuildingType);
  const currentIndex = gameState.selectedBuildingType 
    ? buildingTypes.indexOf(gameState.selectedBuildingType)
    : -1;
  
  const prevIndex = currentIndex <= 0 ? buildingTypes.length - 1 : currentIndex - 1;
  gameState.selectedBuildingType = buildingTypes[prevIndex];
}

/**
 * Updates building preview position based on mouse position
 */
export function updateBuildingPreview(
  gameState: IndexedWorldState,
  mouseWorldPos: Vector2D,
): void {
  if (!gameState.selectedBuildingType || !gameState.buildingPlacementMode) {
    gameState.buildingPreviewPosition = undefined;
    gameState.buildingPreviewValid = undefined;
    return;
  }
  
  // Calculate snapped position
  const previewPos = calculateBuildingPreviewPosition(mouseWorldPos);
  gameState.buildingPreviewPosition = previewPos;
  
  // Validate placement
  const validation = validateBuildingPlacement(
    gameState,
    gameState.selectedBuildingType,
    previewPos,
  );
  
  gameState.buildingPreviewValid = validation.isValid;
}

/**
 * Attempts to place a building at the current preview position
 */
export function placeBuilding(gameState: GameWorldState): boolean {
  if (
    !gameState.selectedBuildingType ||
    !gameState.buildingPreviewPosition ||
    !gameState.buildingPreviewValid
  ) {
    return false;
  }
  
  // Create planned building
  const definition = getBuildingDefinition(gameState.selectedBuildingType);
  const buildingId = gameState.entities.nextEntityId++;
  
  const building: BuildingEntity = {
    id: buildingId,
    type: 'building',
    buildingType: gameState.selectedBuildingType,
    position: { ...gameState.buildingPreviewPosition },
    state: BuildingState.Planned,
    constructionProgress: 0,
    constructionStartTime: gameState.time,
    health: 0,
    maxHealth: definition.maxHealth,
    assignedWorkerIds: [],
    maxWorkers: definition.maxWorkers,
    inputStorage: new Map(),
    outputStorage: new Map(),
    radius: definition.radius,
    
    // Base entity properties
    direction: { x: 0, y: 0 },
    acceleration: 0,
    forces: [],
    velocity: { x: 0, y: 0 },
    debuffs: [],
  };
  
  // Add to entities and buildings
  gameState.entities.entities.set(buildingId, building);
  gameState.buildings.set(buildingId, building);
  
  // Give starter resources for construction
  // This is a simplified implementation - in full version, carriers would transport these
  const constructionCosts = definition.constructionCosts;
  for (const cost of constructionCosts) {
    addResourcesToBuilding(building, cost.resourceType, cost.amount, true);
  }
  
  // Keep placement mode active but clear preview
  // This allows continuous building placement
  gameState.buildingPreviewPosition = undefined;
  gameState.buildingPreviewValid = undefined;
  
  return true;
}

/**
 * Attempts to mark a building for demolition
 */
export function markBuildingForDemolition(
  gameState: GameWorldState,
  buildingId: number,
): boolean {
  const building = gameState.buildings.get(buildingId);
  
  if (!building) {
    return false;
  }
  
  // Can't demolish HQ
  if (building.buildingType === BuildingType.HQ) {
    return false;
  }
  
  // Mark for demolition
  if (building.state === BuildingState.Operational || building.state === BuildingState.Damaged) {
    building.state = BuildingState.MarkedForDemolition;
    building.demolitionStartTime = gameState.time;
    building.demolitionProgress = 0;
    return true;
  }
  
  return false;
}

/**
 * Cancels demolition of a building
 */
export function cancelBuildingDemolition(
  gameState: GameWorldState,
  buildingId: number,
): boolean {
  const building = gameState.buildings.get(buildingId);
  
  if (!building || building.state !== BuildingState.MarkedForDemolition) {
    return false;
  }
  
  // Restore previous state
  building.state = building.health < building.maxHealth
    ? BuildingState.Damaged
    : BuildingState.Operational;
  building.demolitionProgress = undefined;
  building.demolitionStartTime = undefined;
  
  return true;
}

/**
 * Finds a building at the given world position
 */
export function findBuildingAtPosition(
  gameState: IndexedWorldState,
  worldPos: Vector2D,
): BuildingEntity | undefined {
  const buildings = gameState.search.building.byRadius(worldPos, 50);
  
  for (const building of buildings) {
    const dx = building.position.x - worldPos.x;
    const dy = building.position.y - worldPos.y;
    const distSq = dx * dx + dy * dy;
    const radiusSq = building.radius * building.radius;
    
    if (distSq <= radiusSq) {
      return building;
    }
  }
  
  return undefined;
}
