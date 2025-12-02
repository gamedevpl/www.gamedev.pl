/**
 * Building rendering utilities
 * 
 * Renders buildings and building previews
 */

import { GameWorldState } from '../world-types';
import { getBuildingDefinition } from '../buildings/building-definitions';
import { BuildingEntity } from '../entities/buildings/building-entity';
import { BuildingState } from '../buildings/building-types';

/**
 * Renders a building entity
 * This function is called by renderWithWrapping in the translated world context
 */
export function renderBuilding(
  ctx: CanvasRenderingContext2D,
  building: BuildingEntity,
): void {
  ctx.save();
  
  // We're in the translated context, so use world coordinates directly
  const screenPos = building.position;
  
  // Determine color based on state
  let fillColor = '#8B4513'; // Brown for operational
  let strokeColor = '#654321';
  
  if (building.state === BuildingState.Planned) {
    fillColor = '#FFE4B5'; // Light brown for planned
    strokeColor = '#DEB887';
  } else if (building.state === BuildingState.UnderConstruction) {
    fillColor = '#D2691E'; // Chocolate for under construction
    strokeColor = '#A0522D';
  } else if (building.state === BuildingState.Damaged) {
    fillColor = '#696969'; // Dark gray for damaged
    strokeColor = '#505050';
  } else if (building.state === BuildingState.MarkedForDemolition) {
    fillColor = '#FF6347'; // Tomato red for marked for demolition
    strokeColor = '#DC143C';
  }
  
  // Draw building as a rectangle
  ctx.fillStyle = fillColor;
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 2;
  
  const size = building.radius * 2;
  ctx.fillRect(screenPos.x - building.radius, screenPos.y - building.radius, size, size);
  ctx.strokeRect(screenPos.x - building.radius, screenPos.y - building.radius, size, size);
  
  // Draw building type emoji/icon in center
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `${building.radius * 1.2}px Arial`; // Make emoji 1.2x the radius for better visibility
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  // Simple icon based on building type
  const icon = getBuildingIcon(building.buildingType);
  ctx.fillText(icon, screenPos.x, screenPos.y);
  
  // Draw construction/demolition progress if applicable
  if (building.state === BuildingState.UnderConstruction && building.constructionProgress > 0) {
    const progressBarWidth = size * 0.8;
    const progressBarHeight = 4;
    const progressBarX = screenPos.x - progressBarWidth / 2;
    const progressBarY = screenPos.y + building.radius + 5;
    
    ctx.fillStyle = '#333333';
    ctx.fillRect(progressBarX, progressBarY, progressBarWidth, progressBarHeight);
    
    ctx.fillStyle = '#00FF00';
    ctx.fillRect(progressBarX, progressBarY, (progressBarWidth * building.constructionProgress) / 100, progressBarHeight);
  }
  
  ctx.restore();
}

/**
 * Renders building preview when in placement mode
 * This is called in the translated world context, so we calculate position directly
 */
export function renderBuildingPreview(
  ctx: CanvasRenderingContext2D,
  gameState: GameWorldState,
): void {
  if (!gameState.buildingPlacementMode || !gameState.selectedBuildingType || !gameState.buildingPreviewPosition) {
    return;
  }
  
  const definition = getBuildingDefinition(gameState.selectedBuildingType);
  const previewPos = gameState.buildingPreviewPosition;
  
  // Since we're in the translated context, we just use world coordinates directly
  // The context is already translated by (canvas.width/2 - viewportCenter.x, canvas.height/2 - viewportCenter.y)
  const screenPos = previewPos;
  
  ctx.save();
  
  // Determine color based on validity
  const isValid = gameState.buildingPreviewValid ?? false;
  const fillColor = isValid ? 'rgba(0, 255, 0, 0.3)' : 'rgba(255, 0, 0, 0.3)';
  const strokeColor = isValid ? 'rgba(0, 255, 0, 0.8)' : 'rgba(255, 0, 0, 0.8)';
  
  // Draw preview as semi-transparent rectangle
  ctx.fillStyle = fillColor;
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 5]); // Dashed line for preview
  
  const size = definition.radius * 2;
  ctx.fillRect(screenPos.x - definition.radius, screenPos.y - definition.radius, size, size);
  ctx.strokeRect(screenPos.x - definition.radius, screenPos.y - definition.radius, size, size);
  
  // Draw building icon
  ctx.fillStyle = isValid ? 'rgba(255, 255, 255, 0.8)' : 'rgba(255, 200, 200, 0.8)';
  ctx.font = `${definition.radius * 1.2}px Arial`; // Make emoji 1.2x the radius for better visibility
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const icon = getBuildingIcon(gameState.selectedBuildingType);
  ctx.fillText(icon, screenPos.x, screenPos.y);
  
  // Draw building name below preview with better visibility
  ctx.fillStyle = strokeColor;
  ctx.font = 'bold 16px Arial';
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
  ctx.lineWidth = 3;
  ctx.strokeText(definition.name, screenPos.x, screenPos.y + definition.radius + 20);
  ctx.fillText(definition.name, screenPos.x, screenPos.y + definition.radius + 20);
  
  // Draw hint text for cycling
  ctx.font = '12px Arial';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
  ctx.lineWidth = 2;
  const hintText = '[  ] to cycle buildings';
  ctx.strokeText(hintText, screenPos.x, screenPos.y + definition.radius + 38);
  ctx.fillText(hintText, screenPos.x, screenPos.y + definition.radius + 38);
  
  ctx.restore();
}

/**
 * Gets an icon/emoji for a building type
 */
function getBuildingIcon(buildingType: string): string {
  const icons: Record<string, string> = {
    HQ: '🏰',
    MinorHQ: '🏛️',
    House: '🏠',
    Kindergarten: '👶',
    Warehouse: '📦',
    Tavern: '🍺',
    ForestRangerHut: '🌲',
    LumberjackHut: '🪓',
    Sawmill: '🪚',
    QuarrymanHut: '⛏️',
    FishermanHut: '🎣',
    HunterHut: '🏹',
    Farm: '🌾',
    Windmill: '🌬️',
    Bakery: '🍞',
    PigFarm: '🐷',
    Butcher: '🔪',
    IronFoundry: '⚒️',
    GoldFoundry: '💰',
    Blacksmith: '⚔️',
    ToolMaker: '🔧',
    ShipMaker: '⛵',
    GuardTower: '🗼',
    Garrison: '🛡️',
    Barracks: '⚔️',
  };
  
  return icons[buildingType] || '🏗️';
}
