/**
 * Building rendering utilities
 * 
 * Renders buildings and building previews with resource indicators
 */

import { GameWorldState } from '../world-types';
import { getBuildingDefinition } from '../buildings/building-definitions';
import { BuildingEntity } from '../entities/buildings/building-entity';
import { BuildingState, ResourceType } from '../buildings/building-types';

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
  if (building.state === BuildingState.UnderConstruction && building.constructionProgress >= 0) {
    const progressBarWidth = size * 0.9;
    const progressBarHeight = 6;
    const progressBarX = screenPos.x - progressBarWidth / 2;
    const progressBarY = screenPos.y + building.radius + 8;
    
    // Background
    ctx.fillStyle = '#000000';
    ctx.fillRect(progressBarX - 1, progressBarY - 1, progressBarWidth + 2, progressBarHeight + 2);
    
    // Empty bar
    ctx.fillStyle = '#333333';
    ctx.fillRect(progressBarX, progressBarY, progressBarWidth, progressBarHeight);
    
    // Progress fill
    ctx.fillStyle = '#00FF00';
    ctx.fillRect(progressBarX, progressBarY, (progressBarWidth * building.constructionProgress) / 100, progressBarHeight);
    
    // Progress text
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '10px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(`${Math.floor(building.constructionProgress)}%`, screenPos.x, progressBarY + progressBarHeight + 2);
    
    // Worker count indicator
    const workerCount = building.assignedWorkerIds.length;
    if (workerCount > 0) {
      ctx.fillStyle = '#FFD700';
      ctx.font = '9px Arial';
      ctx.fillText(`👷 ${workerCount}`, screenPos.x, progressBarY - 12);
    }
  }
  
  // For operational buildings, show resource storage and production progress
  if (building.state === BuildingState.Operational) {
    renderBuildingResources(ctx, building, screenPos);
    renderProductionProgress(ctx, building, screenPos);
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

/**
 * Gets a short abbreviation and icon for a resource type
 */
function getResourceIcon(resourceType: ResourceType): { icon: string; abbr: string } {
  const resources: Record<ResourceType, { icon: string; abbr: string }> = {
    [ResourceType.Wood]: { icon: '🪵', abbr: 'W' },
    [ResourceType.WoodPlanks]: { icon: '📐', abbr: 'WP' },
    [ResourceType.Stone]: { icon: '🪨', abbr: 'S' },
    [ResourceType.IronOre]: { icon: '🪨', abbr: 'IO' },
    [ResourceType.GoldOre]: { icon: '✨', abbr: 'GO' },
    [ResourceType.Coal]: { icon: '⚫', abbr: 'C' },
    [ResourceType.Granite]: { icon: '⬜', abbr: 'Gr' },
    [ResourceType.Iron]: { icon: '⚙️', abbr: 'I' },
    [ResourceType.Gold]: { icon: '💰', abbr: 'G' },
    [ResourceType.Fish]: { icon: '🐟', abbr: 'F' },
    [ResourceType.Meat]: { icon: '🍖', abbr: 'M' },
    [ResourceType.Wheat]: { icon: '🌾', abbr: 'Wh' },
    [ResourceType.Flour]: { icon: '🥛', abbr: 'Fl' },
    [ResourceType.Bread]: { icon: '🍞', abbr: 'Br' },
    [ResourceType.Sausage]: { icon: '🌭', abbr: 'Sa' },
    [ResourceType.Tools]: { icon: '🔧', abbr: 'T' },
    [ResourceType.Weapons]: { icon: '⚔️', abbr: 'We' },
    [ResourceType.Pigs]: { icon: '🐷', abbr: 'P' },
  };
  
  return resources[resourceType] || { icon: '📦', abbr: '?' };
}

/**
 * Renders resource storage information for a building
 */
function renderBuildingResources(
  ctx: CanvasRenderingContext2D,
  building: BuildingEntity,
  screenPos: { x: number; y: number },
): void {
  const yOffset = building.radius + 15;
  let currentY = screenPos.y + yOffset;
  
  // Show input storage if has any resources
  if (building.inputStorage.size > 0) {
    const resourceText = formatResourceStorage(building.inputStorage, '🔵');
    if (resourceText) {
      ctx.fillStyle = '#FFFFFF';
      ctx.strokeStyle = '#000000';
      ctx.font = '8px Arial';
      ctx.lineWidth = 2;
      ctx.textAlign = 'center';
      ctx.strokeText(resourceText, screenPos.x, currentY);
      ctx.fillText(resourceText, screenPos.x, currentY);
      currentY += 10;
    }
  }
  
  // Show output storage if has any resources
  if (building.outputStorage.size > 0) {
    const resourceText = formatResourceStorage(building.outputStorage, '🟢');
    if (resourceText) {
      ctx.fillStyle = '#FFFFFF';
      ctx.strokeStyle = '#000000';
      ctx.font = '8px Arial';
      ctx.lineWidth = 2;
      ctx.textAlign = 'center';
      ctx.strokeText(resourceText, screenPos.x, currentY);
      ctx.fillText(resourceText, screenPos.x, currentY);
    }
  }
}

/**
 * Formats resource storage into a compact display string
 * Shows top 3 resources with icons and amounts
 */
function formatResourceStorage(storage: Map<ResourceType, number>, prefix: string): string {
  const resources: Array<{ type: ResourceType; amount: number }> = [];
  
  for (const [type, amount] of storage.entries()) {
    if (amount > 0) {
      resources.push({ type, amount });
    }
  }
  
  if (resources.length === 0) {
    return '';
  }
  
  // Sort by amount descending and take top 3
  resources.sort((a, b) => b.amount - a.amount);
  const top3 = resources.slice(0, 3);
  
  const formatted = top3.map(r => {
    const { abbr } = getResourceIcon(r.type);
    return `${abbr}:${r.amount}`;
  }).join(' ');
  
  return `${prefix} ${formatted}`;
}

/**
 * Renders production progress for a building
 * Shows production progress bar and active worker count
 */
function renderProductionProgress(
  ctx: CanvasRenderingContext2D,
  building: BuildingEntity,
  screenPos: { x: number; y: number },
): void {
  // Only show for buildings with active production
  if (!building.productionProgress || building.productionProgress <= 0) {
    return;
  }
  
  const workerCount = building.assignedWorkerIds.length;
  if (workerCount === 0) {
    return; // No workers, no production
  }
  
  const size = building.radius * 2;
  const progressBarWidth = size * 0.7; // Smaller than construction bar
  const progressBarHeight = 4;
  const progressBarX = screenPos.x - progressBarWidth / 2;
  const progressBarY = screenPos.y - building.radius - 12; // Above the building
  
  // Background border
  ctx.fillStyle = '#000000';
  ctx.fillRect(progressBarX - 1, progressBarY - 1, progressBarWidth + 2, progressBarHeight + 2);
  
  // Empty bar
  ctx.fillStyle = '#222222';
  ctx.fillRect(progressBarX, progressBarY, progressBarWidth, progressBarHeight);
  
  // Progress fill - use yellow/orange for production (different from construction green)
  ctx.fillStyle = '#FFA500'; // Orange for production
  const fillWidth = (progressBarWidth * Math.min(building.productionProgress, 100)) / 100;
  ctx.fillRect(progressBarX, progressBarY, fillWidth, progressBarHeight);
  
  // Production icon with worker count
  ctx.fillStyle = '#FFA500';
  ctx.font = '9px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(`⚙️ ${workerCount}`, screenPos.x, progressBarY - 2);
}
