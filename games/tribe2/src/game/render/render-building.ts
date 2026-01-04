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
  getBuildingHitpoints,
} from '../entities/buildings/building-consts';
import { Vector2D } from '../utils/math-types';
import { drawProgressBar } from './render-ui';
import { UI_BAR_BACKGROUND_COLOR } from '../ui/ui-consts';
import { renderWithWrapping, pseudoRandom } from './render-utils';
import { Entity } from '../entities/entities-types';
import { FOOD_TYPE_EMOJIS, FoodType } from '../entities/food-types';
import { ITEM_TYPE_EMOJIS, ItemType } from '../entities/item-types';
import { isEnemyBuilding } from '../utils/human-utils';
import { findPlayerEntity } from '../utils';
import { SpriteCache } from './sprite-cache';
import { Blackboard } from '../ai/behavior-tree/behavior-tree-blackboard';

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

// Palisade visual constants
const PALISADE_LOG_COLOR_DARK = '#5C4033'; // Dark brown
const PALISADE_LOG_COLOR_LIGHT = '#8B6914'; // Light brown
const PALISADE_POINT_COLOR = '#2F1F0F'; // Dark point tip
const PALISADE_LOG_WIDTH = 3; // Width of each log
const PALISADE_LOG_SPACING = 4; // Space between logs

// Gate visual constants
const GATE_FRAME_COLOR = '#4A3728'; // Frame color
const GATE_PLANK_COLOR = '#6B4423'; // Plank color
const GATE_METAL_COLOR = '#4A4A4A'; // Metal bands color

// Storage rendering constants
const STORAGE_ITEM_ICON_SIZE = 6; // Size of food item emojis

// Caching logic
const spriteCache = new SpriteCache(1000);
const SPRITE_PADDING = 20;

/**
 * Generates a unique cache key for a building sprite based on its visual state.
 */
function getBuildingSpriteKey(
  building: BuildingEntity | { buildingType: BuildingType; width: number; height: number; id: number },
  isHostile: boolean,
  isGhost: boolean = false,
  isValid: boolean = true,
): string {
  if (isGhost) {
    return `ghost_${building.buildingType}_${isValid}`;
  }

  const b = building as BuildingEntity;
  const hasFuel = b.buildingType === BuildingType.Bonfire && (b.fuelLevel ?? 0) > 0;

  // Include damage state for palisades and gates (buckets of 25% for caching efficiency)
  let damageLevel = 0;
  if (b.buildingType === BuildingType.Palisade || b.buildingType === BuildingType.Gate) {
    const maxHp = getBuildingHitpoints(b.buildingType);
    const currentHp = b.hitpoints ?? maxHp;
    damageLevel = Math.floor((1 - currentHp / maxHp) * 4); // 0-4 damage levels
  }

  return `${b.id}_${b.buildingType}_${b.width}_${b.height}_${isHostile}_${b.isConstructed}_${hasFuel}_${damageLevel}`;
}

/**
 * Retrieves a cached building sprite or creates a new one.
 */
function getBuildingSprite(
  building: BuildingEntity | { buildingType: BuildingType; width: number; height: number; id: number },
  isHostile: boolean,
  isGhost: boolean = false,
  isValid: boolean = true,
): HTMLCanvasElement {
  const key = getBuildingSpriteKey(building, isHostile, isGhost, isValid);
  const { width, height, id, buildingType } = building;
  const canvasWidth = width + SPRITE_PADDING * 2;
  const canvasHeight = height + SPRITE_PADDING * 2;

  return spriteCache.getOrRender(key, canvasWidth, canvasHeight, (ctx) => {
    const definition = BUILDING_DEFINITIONS[buildingType];
    const isConstructed = 'isConstructed' in building ? building.isConstructed : true;

    ctx.translate(canvasWidth / 2, canvasHeight / 2);

    if (isGhost) {
      const ghostColor = isValid ? '#4CAF50' : '#F44336';

      // Special ghost rendering for palisades and gates
      if (buildingType === BuildingType.Palisade) {
        drawPalisade(ctx, width, height, id, ghostColor, 0);
      } else if (buildingType === BuildingType.Gate) {
        drawGate(ctx, width, height, id, ghostColor, 0);
      } else {
        drawStoneRect(ctx, width, height, 9999, ghostColor);

        ctx.font = `${Math.min(width, height) * 0.5}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = ghostColor;
        ctx.fillText(definition.icon, 0, 0);
      }
    } else {
      const b = building as BuildingEntity;
      let icon = definition.icon;
      if (b.buildingType === BuildingType.Bonfire && isConstructed) {
        icon = (b.fuelLevel ?? 0) > 0 ? '🔥' : '🪵';
      }

      // Special rendering for Palisade
      if (b.buildingType === BuildingType.Palisade) {
        const maxHp = getBuildingHitpoints(b.buildingType);
        const currentHp = b.hitpoints ?? maxHp;
        const damageRatio = 1 - currentHp / maxHp;
        const tintColor = isHostile ? STONE_COLOR_HOSTILE_BASE : undefined;
        drawPalisade(ctx, width, height, id, tintColor, damageRatio);
        return;
      }

      // Special rendering for Gate
      if (b.buildingType === BuildingType.Gate) {
        const maxHp = getBuildingHitpoints(b.buildingType);
        const currentHp = b.hitpoints ?? maxHp;
        const damageRatio = 1 - currentHp / maxHp;
        const tintColor = isHostile ? STONE_COLOR_HOSTILE_BASE : undefined;
        drawGate(ctx, width, height, id, tintColor, damageRatio);
        return;
      }

      // 1. Draw the Stone Border
      if (isHostile) {
        drawStoneRect(ctx, width, height, id, STONE_COLOR_HOSTILE_BASE, STONE_COLOR_HOSTILE_HIGHLIGHT);
      } else {
        drawStoneRect(ctx, width, height, id);
      }

      // 2. Draw Icon
      ctx.globalAlpha = 0.5;
      ctx.font = `${Math.min(width, height, 30) * 0.5}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 4;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(icon, 0, 0);
    }
  });
}

/**
 * Draws a palisade (wooden wall) with sharpened log stakes.
 */
function drawPalisade(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  seed: number,
  tintColor?: string,
  damageRatio: number = 0,
) {
  const left = -width / 2;
  const top = -height / 2;
  const bottom = height / 2;

  // Calculate number of logs that fit
  const logCount = Math.floor(width / PALISADE_LOG_SPACING);

  for (let i = 0; i < logCount; i++) {
    const uniqueLogId = seed + i * 17;
    const rand = pseudoRandom(uniqueLogId);

    // Determine if this log is "damaged" (missing or broken)
    const isDamaged = rand < damageRatio * 0.8;
    if (isDamaged && damageRatio > 0.2) continue; // Skip some logs when damaged

    const x = left + (i + 0.5) * PALISADE_LOG_SPACING;
    const heightVariation = rand * 4 - 2;
    const logHeight = (height - 2) + heightVariation;
    const brokenHeight = isDamaged ? logHeight * (0.3 + rand * 0.4) : logHeight;

    // Log body
    ctx.beginPath();
    ctx.fillStyle = tintColor || (rand > 0.5 ? PALISADE_LOG_COLOR_LIGHT : PALISADE_LOG_COLOR_DARK);
    ctx.roundRect(x - PALISADE_LOG_WIDTH / 2, top + 1, PALISADE_LOG_WIDTH, brokenHeight, 1);
    ctx.fill();

    // Sharpened point at top (if not broken)
    if (!isDamaged || damageRatio < 0.3) {
      ctx.beginPath();
      ctx.fillStyle = tintColor || PALISADE_POINT_COLOR;
      ctx.moveTo(x - PALISADE_LOG_WIDTH / 2, top + 1);
      ctx.lineTo(x, top - 3);
      ctx.lineTo(x + PALISADE_LOG_WIDTH / 2, top + 1);
      ctx.closePath();
      ctx.fill();
    }

    // Add wood grain lines for detail
    if (!isDamaged) {
      ctx.strokeStyle = 'rgba(0,0,0,0.2)';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(x, top + 3);
      ctx.lineTo(x, bottom - 3);
      ctx.stroke();
    }
  }

  // Draw horizontal support beams
  ctx.fillStyle = tintColor || PALISADE_LOG_COLOR_DARK;
  ctx.fillRect(left, top + height * 0.3, width, 2);
  ctx.fillRect(left, bottom - height * 0.3, width, 2);

  // Add damage cracks if damaged
  if (damageRatio > 0.3) {
    ctx.strokeStyle = 'rgba(50, 30, 20, 0.8)';
    ctx.lineWidth = 1;
    for (let i = 0; i < Math.floor(damageRatio * 3); i++) {
      const crackX = left + pseudoRandom(seed + i * 31) * width;
      const crackY = top + pseudoRandom(seed + i * 37) * height;
      ctx.beginPath();
      ctx.moveTo(crackX, crackY);
      ctx.lineTo(crackX + (pseudoRandom(seed + i * 41) - 0.5) * 10, crackY + 8);
      ctx.stroke();
    }
  }
}

/**
 * Draws a gate with wooden planks and metal reinforcements.
 */
function drawGate(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  seed: number,
  tintColor?: string,
  damageRatio: number = 0,
) {
  const left = -width / 2;
  const right = width / 2;
  const top = -height / 2;
  const bottom = height / 2;

  // Draw frame
  ctx.fillStyle = tintColor || GATE_FRAME_COLOR;
  ctx.fillRect(left, top, width, 2); // Top
  ctx.fillRect(left, bottom - 2, width, 2); // Bottom
  ctx.fillRect(left, top, 2, height); // Left
  ctx.fillRect(right - 2, top, 2, height); // Right

  // Draw planks
  const plankCount = Math.floor((width - 4) / 4);
  for (let i = 0; i < plankCount; i++) {
    const uniquePlankId = seed + i * 23;
    const rand = pseudoRandom(uniquePlankId);

    // Determine if this plank is "damaged"
    const isDamaged = rand < damageRatio * 0.6;
    if (isDamaged && damageRatio > 0.3) continue;

    const x = left + 2 + i * 4;
    ctx.fillStyle = tintColor || (rand > 0.5 ? GATE_PLANK_COLOR : GATE_FRAME_COLOR);
    ctx.fillRect(x, top + 2, 3, height - 4);

    // Add wood grain
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(x + 1.5, top + 3);
    ctx.lineTo(x + 1.5, bottom - 3);
    ctx.stroke();
  }

  // Draw metal bands (horizontal reinforcement)
  ctx.fillStyle = tintColor || GATE_METAL_COLOR;
  ctx.fillRect(left + 1, top + height * 0.25, width - 2, 2);
  ctx.fillRect(left + 1, bottom - height * 0.25 - 2, width - 2, 2);

  // Draw metal studs
  const studPositions = [
    { x: left + 4, y: top + height * 0.25 + 1 },
    { x: right - 4, y: top + height * 0.25 + 1 },
    { x: left + 4, y: bottom - height * 0.25 - 1 },
    { x: right - 4, y: bottom - height * 0.25 - 1 },
  ];

  for (const pos of studPositions) {
    ctx.beginPath();
    ctx.fillStyle = tintColor || '#666666';
    ctx.arc(pos.x, pos.y, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Add gate icon (door handle area)
  ctx.fillStyle = tintColor || GATE_METAL_COLOR;
  ctx.beginPath();
  ctx.arc(right - 5, 0, 2, 0, Math.PI * 2);
  ctx.fill();

  // Add damage effects
  if (damageRatio > 0.2) {
    ctx.strokeStyle = 'rgba(40, 30, 20, 0.7)';
    ctx.lineWidth = 1;
    for (let i = 0; i < Math.floor(damageRatio * 4); i++) {
      const crackX = left + pseudoRandom(seed + i * 29) * width;
      const crackY = top + pseudoRandom(seed + i * 33) * height;
      ctx.beginPath();
      ctx.moveTo(crackX, crackY);
      ctx.lineTo(crackX + (pseudoRandom(seed + i * 39) - 0.5) * 8, crackY + 6);
      ctx.stroke();
    }
  }
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
 * Renders the contents of a storage spot as miniature item icons
 * scattered around the building.
 */
function renderStorageContents(ctx: CanvasRenderingContext2D, building: BuildingEntity): void {
  if (!building.storedItems || building.storedItems.length === 0) {
    return;
  }

  const { position, storedItems } = building;

  ctx.save();
  ctx.font = `${STORAGE_ITEM_ICON_SIZE}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Add a subtle shadow to make emojis stand out
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 2;

  storedItems.forEach((storedItem) => {
    const type = storedItem.item.type;
    const emoji = (FOOD_TYPE_EMOJIS[type as FoodType] || ITEM_TYPE_EMOJIS[type as ItemType]) ?? '?';

    // Use stored position if available, otherwise calculate fallback
    const renderPos: Vector2D = {
      x: position.x + storedItem.positionOffset.x,
      y: position.y + storedItem.positionOffset.y,
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
  const { position, width, height, constructionProgress, destructionProgress, isConstructed, isBeingDestroyed } =
    building;

  // Check hostility
  const player = findPlayerEntity(indexedWorld);
  const isHostile = !!(player && isEnemyBuilding(player, building, indexedWorld));

  // Get cached sprite
  const sprite = getBuildingSprite(building, isHostile);

  ctx.save();
  // If under construction, we make the sprite semi-transparent
  if (!isConstructed) {
    ctx.globalAlpha = 0.3 + constructionProgress * 0.7;
  }

  // Draw cached sprite centered at position
  ctx.drawImage(sprite, position.x - sprite.width / 2, position.y - sprite.height / 2);
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
  } else if (building.buildingType === BuildingType.Palisade || building.buildingType === BuildingType.Gate) {
    // Draw hitpoints bar for destructible buildings
    const maxHp = getBuildingHitpoints(building.buildingType);
    const currentHp = building.hitpoints ?? maxHp;
    if (currentHp < maxHp) {
      const hpRatio = currentHp / maxHp;
      // Color based on health: green -> yellow -> red
      const hpColor = hpRatio > 0.5 ? '#4CAF50' : hpRatio > 0.25 ? '#FFC107' : '#F44336';
      drawProgressBar(
        ctx,
        barX,
        barY,
        barWidth,
        BUILDING_PROGRESS_BAR_HEIGHT,
        hpRatio,
        UI_BAR_BACKGROUND_COLOR,
        hpColor,
      );
    }
  }

  // 4. Render storage contents as miniature items
  if (
    (building.buildingType === BuildingType.StorageSpot || building.buildingType === BuildingType.Bonfire) &&
    isConstructed
  ) {
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

  // Get cached ghost sprite
  const sprite = getBuildingSprite({ buildingType, width, height, id: 9999 }, false, true, isValid);

  const drawGhost = (ctx: CanvasRenderingContext2D, pos: Vector2D) => {
    ctx.save();
    ctx.globalAlpha = BUILDING_GHOST_OPACITY;
    ctx.drawImage(sprite, pos.x - sprite.width / 2, pos.y - sprite.height / 2);
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
    stateMachine: [
      '',
      {
        enteredAt: 0,
      },
    ],
    aiBlackboard: Blackboard.create(),
  };

  renderWithWrapping(
    ctx,
    mapDimensions.width,
    mapDimensions.height,
    (context, entity) => drawGhost(context, entity.position),
    ghostEntity,
  );
}
