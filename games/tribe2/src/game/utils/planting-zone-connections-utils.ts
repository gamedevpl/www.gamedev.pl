/**
 * Utilities for calculating and managing connections between adjacent planting zones.
 * Adjacent planting zones belonging to the same tribe are visually joined by hiding
 * the stone borders between them.
 */

import { EntityId } from '../entities/entities-types';
import { BuildingEntity } from '../entities/buildings/building-types';
import { BuildingType, BUILDING_DEFINITIONS } from '../entities/buildings/building-consts';
import { GameWorldState, PlantingZoneConnections } from '../world-types';
import { IndexedWorldState } from '../world-index/world-index-types';

/**
 * Threshold distance for considering two planting zones as adjacent.
 * Zones are adjacent if the distance between their edges is within this threshold.
 */
const ADJACENCY_THRESHOLD = 5;

/**
 * Gets the planting zone dimensions from the building definitions.
 */
function getPlantingZoneDimensions(): { width: number; height: number } {
  return BUILDING_DEFINITIONS[BuildingType.PlantingZone].dimensions;
}

/**
 * Checks if two planting zones are horizontally adjacent (side by side).
 * @param zone1 The first planting zone.
 * @param zone2 The second planting zone.
 * @param dimensions The dimensions of a planting zone.
 * @returns True if zone2 is to the right of zone1 (zone1.right touches zone2.left).
 */
function isAdjacentHorizontally(
  zone1: BuildingEntity,
  zone2: BuildingEntity,
  dimensions: { width: number; height: number },
): boolean {
  const zone1Right = zone1.position.x + dimensions.width / 2;
  const zone2Left = zone2.position.x - dimensions.width / 2;

  // Check if zone2 is to the right of zone1
  const horizontalDistance = zone2Left - zone1Right;

  // Check vertical overlap - zones must be at approximately the same vertical level
  const zone1Top = zone1.position.y - dimensions.height / 2;
  const zone1Bottom = zone1.position.y + dimensions.height / 2;
  const zone2Top = zone2.position.y - dimensions.height / 2;
  const zone2Bottom = zone2.position.y + dimensions.height / 2;

  const verticalOverlap = Math.min(zone1Bottom, zone2Bottom) - Math.max(zone1Top, zone2Top);

  return (
    horizontalDistance >= -ADJACENCY_THRESHOLD &&
    horizontalDistance <= ADJACENCY_THRESHOLD &&
    verticalOverlap > dimensions.height * 0.5
  );
}

/**
 * Checks if two planting zones are vertically adjacent (one above the other).
 * @param zone1 The first planting zone.
 * @param zone2 The second planting zone.
 * @param dimensions The dimensions of a planting zone.
 * @returns True if zone2 is below zone1 (zone1.bottom touches zone2.top).
 */
function isAdjacentVertically(
  zone1: BuildingEntity,
  zone2: BuildingEntity,
  dimensions: { width: number; height: number },
): boolean {
  const zone1Bottom = zone1.position.y + dimensions.height / 2;
  const zone2Top = zone2.position.y - dimensions.height / 2;

  // Check if zone2 is below zone1
  const verticalDistance = zone2Top - zone1Bottom;

  // Check horizontal overlap - zones must be at approximately the same horizontal level
  const zone1Left = zone1.position.x - dimensions.width / 2;
  const zone1Right = zone1.position.x + dimensions.width / 2;
  const zone2Left = zone2.position.x - dimensions.width / 2;
  const zone2Right = zone2.position.x + dimensions.width / 2;

  const horizontalOverlap = Math.min(zone1Right, zone2Right) - Math.max(zone1Left, zone2Left);

  return (
    verticalDistance >= -ADJACENCY_THRESHOLD &&
    verticalDistance <= ADJACENCY_THRESHOLD &&
    horizontalOverlap > dimensions.width * 0.5
  );
}

/**
 * Calculates the connections for all planting zones in the game state.
 * Two zones are connected if they are adjacent and belong to the same tribe (same ownerId).
 * @param gameState The current game state.
 * @returns A record mapping zone entity IDs to their connection information.
 */
function calculatePlantingZoneConnections(gameState: GameWorldState): Record<EntityId, PlantingZoneConnections> {
  const connections: Record<EntityId, PlantingZoneConnections> = {};
  const dimensions = getPlantingZoneDimensions();

  // Get all planting zones from the indexed world state
  const indexedState = gameState as IndexedWorldState;
  if (!indexedState.search?.building) {
    return connections;
  }

  const allBuildings = indexedState.search.building.all();
  const plantingZones = allBuildings.filter(
    (building) => building.buildingType === BuildingType.PlantingZone && building.isConstructed,
  );

  // Initialize connections for all planting zones
  for (const zone of plantingZones) {
    connections[zone.id] = {
      top: false,
      bottom: false,
      left: false,
      right: false,
    };
  }

  // Check each pair of zones for adjacency
  for (let i = 0; i < plantingZones.length; i++) {
    const zone1 = plantingZones[i];

    for (let j = i + 1; j < plantingZones.length; j++) {
      const zone2 = plantingZones[j];

      // Only connect zones with the same owner
      if (zone1.ownerId !== zone2.ownerId) {
        continue;
      }

      // Check horizontal adjacency (zone2 to the right of zone1)
      if (isAdjacentHorizontally(zone1, zone2, dimensions)) {
        connections[zone1.id].right = true;
        connections[zone2.id].left = true;
      }
      // Check horizontal adjacency (zone1 to the right of zone2)
      if (isAdjacentHorizontally(zone2, zone1, dimensions)) {
        connections[zone2.id].right = true;
        connections[zone1.id].left = true;
      }

      // Check vertical adjacency (zone2 below zone1)
      if (isAdjacentVertically(zone1, zone2, dimensions)) {
        connections[zone1.id].bottom = true;
        connections[zone2.id].top = true;
      }
      // Check vertical adjacency (zone1 below zone2)
      if (isAdjacentVertically(zone2, zone1, dimensions)) {
        connections[zone2.id].bottom = true;
        connections[zone1.id].top = true;
      }
    }
  }

  return connections;
}

/**
 * Updates the planting zone connections in the game state.
 * This should be called whenever planting zones are created or destroyed.
 * @param gameState The current game state (will be mutated).
 */
export function updatePlantingZoneConnections(gameState: GameWorldState): void {
  gameState.plantingZoneConnections = calculatePlantingZoneConnections(gameState);
}
