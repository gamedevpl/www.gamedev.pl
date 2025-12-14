import { BuildingEntity } from '../entities/buildings/building-types';
import { IndexedWorldState } from '../world-index/world-index-types';
import {
  BUILDING_DEFINITIONS,
  BuildingType,
  BUILDING_GHOST_OPACITY,
  BUILDING_CONSTRUCTION_BAR_COLOR,
  BUILDING_DESTRUCTION_BAR_COLOR,
  BUILDING_PROGRESS_BAR_HEIGHT,
  BUILDING_PROGRESS_BAR_OFFSET,
} from '../entities/buildings/building-consts';
import { Vector2D } from '../utils/math-types';
import { drawProgressBar } from './render-ui';
import { UI_BAR_BACKGROUND_COLOR } from '../ui/ui-consts';
import { renderWithWrapping } from './render-utils';
import { Entity } from '../entities/entities-types';
import { FOOD_TYPE_EMOJIS } from '../entities/food-types';
import { isEnemyBuilding } from '../utils/human-utils';
import { findPlayerEntity } from '../utils';

// Visual Constants for the stones
const STONE_SPACING = 8; // Distance between stones
const STONE_BASE_RADIUS = 1.5; // Average size of a stone
const STONE_VAR_RADIUS = 0.5; // How much size varies
const STONE_VAR_OFFSET = 2; // How much position wiggles
const STONE_COLOR_BASE = '#5a5a5a'; // Dark grey
const STONE_COLOR_HIGHLIGHT = '#7e7e7e'; // Lighter grey

// Hostile building colors
const STONE_COLOR_HOSTILE_BASE = '#8B0000'; // Dark Red
const STONE_COLOR_HOSTILE_HIGHLIGHT = '#FF4444'; // Light Red

// Storage rendering constants
const STORAGE_ITEM_ICON_SIZE = 6; // Size of food item emojis

/**
 * A simple pseudo-random number generator based on an input seed.
 * Returns a number between -1 and 1.
 * This ensures stones look "random" but don't jitter every frame.
 */
function pseudoRandom(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x); // Returns 0 to 1
}

/**
 * Draws a border made of stones around a rectangle.
 */
function drawStoneRect(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  seed: number,
  overrideColor?: string,
  overrideHighlightColor?: string,
) {
  const perimeter = (width + height) * 2;
  const stoneCount = Math.floor(perimeter / STONE_SPACING);

  // Define the 4 corners relative to center
  const left = -width / 2;
  const right = width / 2;
  const top = -height / 2;
  const bottom = height / 2;

  // We walk the perimeter: Top -> Right -> Bottom -> Left
  for (let i = 0; i < stoneCount; i++) {
    // Generate deterministic variation based on building ID + stone index
    const uniqueStoneId = seed + i * 13;
    const randSize = pseudoRandom(uniqueStoneId);
    const randOffset = pseudoRandom(uniqueStoneId + 1);

    // Determine position along perimeter
    let currentDist = i * STONE_SPACING;
    let x = 0;
    let y = 0;

    if (currentDist < width) {
      // Top Edge
      x = left + currentDist;
      y = top;
    } else if (currentDist < width + height) {
      // Right Edge
      x = right;
      y = top + (currentDist - width);
    } else if (currentDist < width * 2 + height) {
      // Bottom Edge
      x = right - (currentDist - (width + height));
      y = bottom;
    } else {
      // Left Edge
      x = left;
      y = bottom - (currentDist - (width * 2 + height));
    }

    // Apply wiggle
    const wiggleX = (randOffset - 0.5) * STONE_VAR_OFFSET;
    const wiggleY = (pseudoRandom(uniqueStoneId + 2) - 0.5) * STONE_VAR_OFFSET;

    // Draw the stone
    ctx.beginPath();
    const radius = STONE_BASE_RADIUS + randSize * STONE_VAR_RADIUS;

    // Determine color
    if (overrideColor) {
      ctx.fillStyle = overrideColor;
    } else {
      ctx.fillStyle =
        randSize > 0.5 ? overrideHighlightColor || STONE_COLOR_HIGHLIGHT : overrideColor || STONE_COLOR_BASE;
    }

    // Draw slightly irregular circle (ellipse)
    ctx.ellipse(x + wiggleX, y + wiggleY, radius, radius * 0.85, randOffset * Math.PI, 0, Math.PI * 2);
    ctx.fill();

    // Optional: Add a small outline for definition if no override color is set
    if (!overrideColor) {
      ctx.strokeStyle = '#2b2b2b';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
}

/**
 * Renders the contents of a storage spot as miniature food item icons
 * scattered around the building.
 */
function renderStorageContents(ctx: CanvasRenderingContext2D, building: BuildingEntity): void {
  if (!building.storedFood || building.storedFood.length === 0) {
    return;
  }

  const { position, storedFood } = building;

  ctx.save();
  ctx.font = `${STORAGE_ITEM_ICON_SIZE}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Add a subtle shadow to make emojis stand out
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 2;

  storedFood.forEach((foodItem) => {
    const emoji = FOOD_TYPE_EMOJIS[foodItem.item.type];

    // Use stored position if available, otherwise calculate fallback
    const renderPos: Vector2D = {
      x: position.x + foodItem.positionOffset.x,
      y: position.y + foodItem.positionOffset.y,
    };

    ctx.fillText(emoji, renderPos.x, renderPos.y);
  });

  // Reset shadow
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';

  ctx.restore();
}

/**
 * Renders a building entity.
 */
export function renderBuilding(
  ctx: CanvasRenderingContext2D,
  building: BuildingEntity,
  indexedWorld: IndexedWorldState,
): void {
  const { position, width, height, constructionProgress, destructionProgress, isConstructed, isBeingDestroyed, id } =
    building;
  const definition = BUILDING_DEFINITIONS[building.buildingType];

  // Check hostility
  const player = findPlayerEntity(indexedWorld);
  const isHostile = player && isEnemyBuilding(player, building, indexedWorld);

  ctx.save();
  ctx.translate(position.x, position.y);

  // 1. Draw the Stone Border
  // If under construction, we make the stones semi-transparent
  if (!isConstructed) {
    ctx.globalAlpha = 0.3 + constructionProgress * 0.7;
  }

  if (isHostile) {
    drawStoneRect(ctx, width, height, id, STONE_COLOR_HOSTILE_BASE, STONE_COLOR_HOSTILE_HIGHLIGHT);
  } else {
    drawStoneRect(ctx, width, height, id);
  }

  // 2. Draw Icon (Floating in the middle, no background box)
  // We add a slight shadow/outline to the emoji so it pops against grass
  ctx.globalAlpha = 0.5; // Ensure icon is fully visible
  ctx.font = `${Math.min(width, height, 30) * 0.5}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Icon Shadow/Outline
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 4;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(definition.icon, 0, 0);

  // Clean up shadow for other draws
  ctx.shadowBlur = 0;

  ctx.restore();

  // 3. Draw Progress Bars (unchanged)
  const barWidth = width;
  const barX = position.x - barWidth / 2;
  const barY = position.y + height / 2 + BUILDING_PROGRESS_BAR_OFFSET;

  if (!isConstructed) {
    drawProgressBar(
      ctx,
      barX,
      barY,
      barWidth,
      BUILDING_PROGRESS_BAR_HEIGHT,
      constructionProgress,
      UI_BAR_BACKGROUND_COLOR,
      BUILDING_CONSTRUCTION_BAR_COLOR,
    );
  } else if (isBeingDestroyed) {
    drawProgressBar(
      ctx,
      barX,
      barY,
      barWidth,
      BUILDING_PROGRESS_BAR_HEIGHT,
      1 - destructionProgress,
      UI_BAR_BACKGROUND_COLOR,
      BUILDING_DESTRUCTION_BAR_COLOR,
    );
  }

  // 4. Render storage contents as miniature food items
  // This is called after ctx.restore() to ensure clean transform state
  if (building.buildingType === 'storageSpot' && isConstructed) {
    renderStorageContents(ctx, building);
  }
}

/**
 * Renders a ghost preview of a building for placement.
 */
export function renderGhostBuilding(
  ctx: CanvasRenderingContext2D,
  position: Vector2D,
  buildingType: BuildingType,
  isValid: boolean,
  mapDimensions: { width: number; height: number },
): void {
  const definition = BUILDING_DEFINITIONS[buildingType];
  const { width, height } = definition.dimensions;

  const drawGhost = (ctx: CanvasRenderingContext2D, pos: Vector2D) => {
    ctx.save();
    ctx.translate(pos.x, pos.y);

    ctx.globalAlpha = BUILDING_GHOST_OPACITY;

    // Choose color based on validity
    // Greenish for valid, Reddish for invalid
    const ghostColor = isValid ? '#4CAF50' : '#F44336';

    // Draw the stone border using a temporary seed (e.g. 9999)
    drawStoneRect(ctx, width, height, 9999, ghostColor);

    // Draw Icon
    ctx.font = `${Math.min(width, height) * 0.5}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = ghostColor;
    ctx.fillText(definition.icon, 0, 0);

    ctx.restore();
  };

  const ghostEntity: Entity = {
    position: { ...position },
    radius: Math.max(width, height) / 2,
    id: 0,
    type: 'building',
    direction: { x: 0, y: 0 },
    acceleration: 0,
    forces: [],
    velocity: { x: 0, y: 0 },
    debuffs: [],
  };

  renderWithWrapping(
    ctx,
    mapDimensions.width,
    mapDimensions.height,
    (context, entity) => drawGhost(context, entity.position),
    ghostEntity,
  );
}
