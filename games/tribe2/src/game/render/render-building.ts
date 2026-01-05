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
import { getDirectionVectorOnTorus } from '../utils/math-utils';
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
import { NAV_GRID_RESOLUTION } from '../utils/navigation-utils';
import { TERRITORY_COLORS } from '../entities/tribe/territory-consts';

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

// Palisade/Gate Visual Constants
const WOOD_COLOR_BASE = '#8B4513'; // SaddleBrown
const WOOD_COLOR_HIGHLIGHT = '#A0522D'; // Sienna
const CRACK_COLOR = 'rgba(40, 40, 40, 0.7)';

// Caching logic
const spriteCache = new SpriteCache(1000);
const SPRITE_PADDING = 20;

/**
 * Interface for palisade connectivity flags.
 */
interface PalisadeConnections {
  top: boolean;
  right: boolean;
  bottom: boolean;
  left: boolean;
  topRight: boolean;
  bottomRight: boolean;
  bottomLeft: boolean;
  topLeft: boolean;
}

const DEFAULT_CONNECTIONS: PalisadeConnections = {
  top: false,
  right: false,
  bottom: false,
  left: false,
  topRight: false,
  bottomRight: false,
  bottomLeft: false,
  topLeft: false,
};

/**
 * Generates a unique cache key for a building sprite based on its visual state.
 */
function getBuildingSpriteKey(
  building: BuildingEntity | { buildingType: BuildingType; width: number; height: number; id: number; ownerId?: number | null },
  isHostile: boolean,
  isGhost: boolean = false,
  isValid: boolean = true,
  connections: PalisadeConnections = DEFAULT_CONNECTIONS,
): string {
  if (isGhost) {
    return `ghost_${building.buildingType}_${isValid}`;
  }

  const b = building as BuildingEntity;
  const hasFuel = b.buildingType === BuildingType.Bonfire && (b.fuelLevel ?? 0) > 0;
  const c = connections;
  const connKey = `${c.top}${c.right}${c.bottom}${c.left}${c.topRight}${c.bottomRight}${c.bottomLeft}${c.topLeft}`;
  return `${b.id}_${b.buildingType}_${b.width}_${b.height}_${isHostile}_${b.isConstructed}_${hasFuel}_${connKey}`;
}

/**
 * Retrieves a cached building sprite or creates a new one.
 */
function getBuildingSprite(
  building: BuildingEntity | { buildingType: BuildingType; width: number; height: number; id: number; ownerId?: number | null },
  isHostile: boolean,
  isGhost: boolean = false,
  isValid: boolean = true,
  connections: PalisadeConnections = DEFAULT_CONNECTIONS,
): HTMLCanvasElement {
  const key = getBuildingSpriteKey(building, isHostile, isGhost, isValid, connections);
  const { width, height, id, buildingType } = building;
  const canvasWidth = width + SPRITE_PADDING * 2;
  const canvasHeight = height + SPRITE_PADDING * 2;

  return spriteCache.getOrRender(key, canvasWidth, canvasHeight, (ctx) => {
    const definition = BUILDING_DEFINITIONS[buildingType];
    const isConstructed = 'isConstructed' in building ? building.isConstructed : true;

    ctx.translate(canvasWidth / 2, canvasHeight / 2);

    if (isGhost) {
      const ghostColor = isValid ? '#4CAF50' : '#F44336';
      if (buildingType === BuildingType.Palisade || buildingType === BuildingType.Gate) {
        drawWoodPost(ctx, width, height, ghostColor);
      } else {
        drawStoneRect(ctx, width, height, 9999, ghostColor);
      }

      ctx.font = `${Math.min(width, height) * 0.5}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = ghostColor;
      ctx.fillText(definition.icon, 0, 0);
    } else {
      const b = building as BuildingEntity;
      let icon = definition.icon;
      
      // Determine tribe color
      let tribeColor = '#FFFFFF';
      if (b.ownerId !== undefined && b.ownerId !== null) {
        tribeColor = TERRITORY_COLORS[b.ownerId % TERRITORY_COLORS.length];
      }

      if (buildingType === BuildingType.Palisade) {
        drawPalisade(ctx, width, height, id, tribeColor, connections);
      } else if (buildingType === BuildingType.Gate) {
        drawGate(ctx, width, height, tribeColor, connections);
      } else {
        if (b.buildingType === BuildingType.Bonfire && isConstructed) {
          icon = (b.fuelLevel ?? 0) > 0 ? '🔥' : '🪵';
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
    }
  });
}

/**
 * Draws a wooden post (used for ghosts and as base for palisades).
 */
function drawWoodPost(ctx: CanvasRenderingContext2D, width: number, height: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(-width / 2, -height / 2, width, height);
  ctx.strokeStyle = 'rgba(0,0,0,0.2)';
  ctx.strokeRect(-width / 2, -height / 2, width, height);
}

/**
 * Draws a palisade segment with connections.
 */
function drawPalisade(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  seed: number,
  tribeColor: string,
  connections: PalisadeConnections,
) {
  const halfW = width / 2;
  const halfH = height / 2;
  const beamThickness = height / 4;

  // 1. Draw Beams (Behind Post)
  ctx.fillStyle = WOOD_COLOR_BASE;
  
  // Orthogonal beams
  if (connections.right) ctx.fillRect(0, -beamThickness / 2, halfW, beamThickness);
  if (connections.left) ctx.fillRect(-halfW, -beamThickness / 2, halfW, beamThickness);
  if (connections.bottom) ctx.fillRect(-beamThickness / 2, 0, beamThickness, halfH);
  if (connections.top) ctx.fillRect(-beamThickness / 2, -halfH, beamThickness, halfH);

  // Diagonal beams
  ctx.lineWidth = beamThickness;
  ctx.strokeStyle = WOOD_COLOR_BASE;
  ctx.lineCap = 'round';
  
  const drawDiagonalBeam = (targetX: number, targetY: number) => {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(targetX, targetY);
    ctx.stroke();
  };

  if (connections.topRight) drawDiagonalBeam(halfW, -halfH);
  if (connections.bottomRight) drawDiagonalBeam(halfW, halfH);
  if (connections.bottomLeft) drawDiagonalBeam(-halfW, halfH);
  if (connections.topLeft) drawDiagonalBeam(-halfW, -halfH);

  // 2. Main Post
  const postWidth = width / 2;
  ctx.fillStyle = WOOD_COLOR_BASE;
  ctx.fillRect(-postWidth / 2, -halfH, postWidth, height);
  
  // Highlight
  ctx.fillStyle = WOOD_COLOR_HIGHLIGHT;
  ctx.fillRect(-postWidth / 4, -halfH, postWidth / 2, height);

  // Smart Sharpening: Only draw pointed top if no palisade above
  if (!connections.top) {
    ctx.fillStyle = WOOD_COLOR_BASE;
    ctx.beginPath();
    ctx.moveTo(-postWidth / 2, -halfH);
    ctx.lineTo(0, -halfH - 5);
    ctx.lineTo(postWidth / 2, -halfH);
    ctx.fill();
  }

  // Tribe accent band
  ctx.fillStyle = tribeColor;
  ctx.fillRect(-postWidth / 2, -height / 8, postWidth, height / 4);
  
  // Wood grain lines
  ctx.strokeStyle = 'rgba(0,0,0,0.1)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 3; i++) {
    const x = (pseudoRandom(seed + i) - 0.5) * postWidth;
    ctx.beginPath();
    ctx.moveTo(x, -halfH);
    ctx.lineTo(x, halfH);
    ctx.stroke();
  }
}

/**
 * Draws a gate segment.
 */
function drawGate(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  tribeColor: string,
  connections: PalisadeConnections,
) {
  // Rotate gate if connected vertically
  if (connections.top || connections.bottom) {
    ctx.rotate(Math.PI / 2);
  }

  const postWidth = width / 4;
  const halfW = width / 2;
  const halfH = height / 2;

  // Side Posts
  ctx.fillStyle = WOOD_COLOR_BASE;
  ctx.fillRect(-halfW, -halfH, postWidth, height);
  ctx.fillRect(halfW - postWidth, -halfH, postWidth, height);

  // Top Crossbeam
  ctx.fillStyle = '#5D2906'; // Darker wood
  ctx.fillRect(-halfW, -halfH, width, postWidth);

  // Door panels
  ctx.fillStyle = WOOD_COLOR_BASE;
  const doorWidth = (width - postWidth * 2) / 2;
  ctx.fillRect(-halfW + postWidth + 1, -halfH + postWidth + 1, doorWidth - 2, height - postWidth - 2);
  ctx.fillRect(1, -halfH + postWidth + 1, doorWidth - 2, height - postWidth - 2);

  // Wood grain on doors
  ctx.strokeStyle = 'rgba(0,0,0,0.1)';
  ctx.lineWidth = 1;
  for (let i = -1; i <= 1; i += 2) {
    const x = i * (doorWidth / 2);
    ctx.beginPath();
    ctx.moveTo(x, -halfH + postWidth);
    ctx.lineTo(x, halfH);
    ctx.stroke();
  }

  // Tribe emblem/color
  ctx.fillStyle = tribeColor;
  ctx.beginPath();
  ctx.arc(0, postWidth / 2, 4, 0, Math.PI * 2);
  ctx.fill();

  // Handles
  ctx.fillStyle = '#C0C0C0';
  ctx.fillRect(-2, postWidth / 2 - 1, 1, 2);
  ctx.fillRect(1, postWidth / 2 - 1, 1, 2);
}

/**
 * Draws cracks on a building based on destruction progress.
 */
function drawCracks(ctx: CanvasRenderingContext2D, width: number, height: number, progress: number, seed: number) {
  if (progress <= 0) return;

  ctx.save();
  ctx.strokeStyle = CRACK_COLOR;
  ctx.lineWidth = 1;
  ctx.lineCap = 'round';

  const numCracks = Math.floor(progress * 10) + 1;
  for (let i = 0; i < numCracks; i++) {
    const s = seed + i * 17;
    let x = (pseudoRandom(s) - 0.5) * width;
    let y = (pseudoRandom(s + 1) - 0.5) * height;
    
    ctx.beginPath();
    ctx.moveTo(x, y);
    const length = 5 + pseudoRandom(s + 2) * 10;
    const angle = pseudoRandom(s + 3) * Math.PI * 2;
    
    for (let j = 0; j < 3; j++) {
      x += Math.cos(angle) * (length / 3);
      y += Math.sin(angle) * (length / 3);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();
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
  const { position, width, height, constructionProgress, destructionProgress, isConstructed, isBeingDestroyed, buildingType, ownerId, id } =
    building;

  // Check hostility
  const player = findPlayerEntity(indexedWorld);
  const isHostile = !!(player && isEnemyBuilding(player, building, indexedWorld));

  // Connectivity check for Palisades
  let connections: PalisadeConnections = { ...DEFAULT_CONNECTIONS };
  if (buildingType === BuildingType.Palisade || buildingType === BuildingType.Gate) {
    const { width: worldWidth, height: worldHeight } = indexedWorld.mapDimensions;
    const nearbyBuildings = indexedWorld.search.building.byRadius(position, NAV_GRID_RESOLUTION * 1.5);

    for (const neighbor of nearbyBuildings) {
      if (neighbor.id === id) continue; // Skip self

      if (
        (neighbor.buildingType === BuildingType.Palisade || neighbor.buildingType === BuildingType.Gate) &&
        neighbor.ownerId === ownerId
      ) {
        const dir = getDirectionVectorOnTorus(position, neighbor.position, worldWidth, worldHeight);
        const threshold = NAV_GRID_RESOLUTION * 0.5;

        const isRight = dir.x > threshold;
        const isLeft = dir.x < -threshold;
        const isBottom = dir.y > threshold;
        const isTop = dir.y < -threshold;

        const absX = Math.abs(dir.x);
        const absY = Math.abs(dir.y);

        // Orthogonal
        if (absX > threshold && absY < threshold) {
          if (isRight) connections.right = true;
          if (isLeft) connections.left = true;
        } else if (absY > threshold && absX < threshold) {
          if (isBottom) connections.bottom = true;
          if (isTop) connections.top = true;
        } 
        // Diagonal
        else if (absX > threshold && absY > threshold) {
          if (isRight && isTop) connections.topRight = true;
          if (isRight && isBottom) connections.bottomRight = true;
          if (isLeft && isBottom) connections.bottomLeft = true;
          if (isLeft && isTop) connections.topLeft = true;
        }
      }
    }
  }

  // Get cached sprite
  const sprite = getBuildingSprite(building, isHostile, false, true, connections);

  ctx.save();
  // If under construction, we make the sprite semi-transparent
  if (!isConstructed) {
    ctx.globalAlpha = 0.3 + constructionProgress * 0.7;
  }

  // Draw cached sprite centered at position
  ctx.drawImage(sprite, position.x - sprite.width / 2, position.y - sprite.height / 2);
  
  // Damage feedback (cracks)
  if (isBeingDestroyed && isConstructed) {
    ctx.translate(position.x, position.y);
    drawCracks(ctx, width, height, destructionProgress, id);
  }
  
  ctx.restore();

  // 3. Draw Progress Bars
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
  const sprite = getBuildingSprite({ buildingType, width, height, id: 9999 }, false, true, isValid, DEFAULT_CONNECTIONS);

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
