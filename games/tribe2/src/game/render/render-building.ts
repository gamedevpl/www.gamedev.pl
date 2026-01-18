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
import { Entity, EntityId } from '../entities/entities-types';
import { FOOD_TYPE_EMOJIS, FoodType } from '../entities/food-types';
import { ITEM_TYPE_EMOJIS, ItemType } from '../entities/item-types';
import { isEnemyBuilding } from '../utils/human-utils';
import { findPlayerEntity } from '../utils';
import { SpriteCache } from './sprite-cache';
import { Blackboard } from '../ai/behavior-tree/behavior-tree-blackboard';
import { TERRITORY_COLORS, TERRITORY_OWNERSHIP_RESOLUTION } from '../entities/tribe/territory-consts';
import { drawPalisade, PalisadeConnections } from './render-palisade';
import { drawGate } from './render-gate';

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

const CRACK_COLOR = 'rgba(40, 40, 40, 0.7)';

// Caching logic
const spriteCache = new SpriteCache(1000);
const SPRITE_PADDING = 50;

const DEFAULT_CONNECTIONS: PalisadeConnections = {
  connections: [],
  isInner: false,
  isVertical: false,
  wallAngle: 0,
  hasGateNeighbor: false,
};

/**
 * Generates a unique cache key for a building sprite based on its visual state.
 */
function getBuildingSpriteKey(
  building:
    | BuildingEntity
    | { buildingType: BuildingType; width: number; height: number; id: number; ownerId?: number | null },
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

  // Create a stable key by sorting connections and rounding angles/distances
  const connKey =
    connections.connections
      .slice()
      .sort((a, b) => a.angle - b.angle)
      .map((c) => {
        const deg = Math.round((c.angle * 180) / Math.PI / 5) * 5; // Round to 5 deg
        const dist = Math.round(c.distance / 2) * 2; // Round to 2px
        return `${deg}:${dist}`;
      })
      .join(',') + `_inner:${connections.isInner}_vert:${connections.isVertical}_ang:${Math.round(connections.wallAngle * 10)}`;

  const tribeKey = b.ownerId ?? 'neutral';

  return `${b.buildingType}_${b.width}_${b.height}_${isHostile}_${b.isConstructed}_${hasFuel}_${tribeKey}_${connKey}`;
}

/**
 * Retrieves a cached building sprite or creates a new one.
 */
function getBuildingSprite(
  building:
    | BuildingEntity
    | { buildingType: BuildingType; width: number; height: number; id: number; ownerId?: number | null },
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

    ctx.translate(canvasWidth / 2, canvasHeight / 2);

    if (isGhost) {
      const ghostColor = isValid ? '#4CAF50' : '#F44336';
      if (buildingType === BuildingType.Palisade || buildingType === BuildingType.Gate) {
        drawGhostBox(ctx, width, height, ghostColor);
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
        drawGate(ctx, width, height, id, tribeColor, connections);
      } else {
        // 1. Draw the Stone Border
        if (isHostile) {
          drawStoneRect(ctx, width, height, id, STONE_COLOR_HOSTILE_BASE, STONE_COLOR_HOSTILE_HIGHLIGHT);
        } else {
          drawStoneRect(ctx, width, height, id);
        }

        // 2. Draw Icon (if not a bonfire - we use visual effects for bonfires)
        if (buildingType !== BuildingType.Bonfire) {
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
    }
  });
}

/**
 * Draws a simple box for ghost previews, matching the chunky style.
 */
function drawGhostBox(ctx: CanvasRenderingContext2D, width: number, height: number, color: string) {
  const halfW = width / 2;
  const halfH = height / 2;

  ctx.fillStyle = color;
  ctx.globalAlpha = 0.3;
  ctx.fillRect(-halfW, -halfH, width, height);

  ctx.globalAlpha = 0.8;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.strokeRect(-halfW, -halfH, width, height);

  ctx.globalAlpha = 1.0;
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

  const left = -width / 2;
  const right = width / 2;
  const top = -height / 2;
  const bottom = height / 2;

  for (let i = 0; i < stoneCount; i++) {
    const uniqueStoneId = seed + i * 13;
    const randSize = pseudoRandom(uniqueStoneId);
    const randOffset = pseudoRandom(uniqueStoneId + 1);

    let currentDist = i * STONE_SPACING;
    let x = 0;
    let y = 0;

    if (currentDist < width) {
      x = left + currentDist;
      y = top;
    } else if (currentDist < width + height) {
      x = right;
      y = top + (currentDist - width);
    } else if (currentDist < width * 2 + height) {
      x = right - (currentDist - (width + height));
      y = bottom;
    } else {
      x = left;
      y = bottom - (currentDist - (width * 2 + height));
    }

    const wiggleX = (randOffset - 0.5) * STONE_VAR_OFFSET;
    const wiggleY = (pseudoRandom(uniqueStoneId + 2) - 0.5) * STONE_VAR_OFFSET;

    ctx.beginPath();
    const radius = STONE_BASE_RADIUS + randSize * STONE_VAR_RADIUS;

    if (overrideColor) {
      ctx.fillStyle = overrideColor;
    } else {
      ctx.fillStyle =
        randSize > 0.5 ? overrideHighlightColor || STONE_COLOR_HIGHLIGHT : overrideColor || STONE_COLOR_BASE;
    }

    ctx.ellipse(x + wiggleX, y + wiggleY, radius, radius * 0.85, randOffset * Math.PI, 0, Math.PI * 2);
    ctx.fill();

    if (!overrideColor) {
      ctx.strokeStyle = '#2b2b2b';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
}

/**
 * Renders the contents of a storage spot as miniature item icons
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

  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 2;

  storedItems.forEach((storedItem) => {
    const type = storedItem.item.type;
    const emoji = (FOOD_TYPE_EMOJIS[type as FoodType] || ITEM_TYPE_EMOJIS[type as ItemType]) ?? '?';

    const renderPos: Vector2D = {
      x: position.x + storedItem.positionOffset.x,
      y: position.y + storedItem.positionOffset.y,
    };

    ctx.fillText(emoji, renderPos.x, renderPos.y);
  });

  ctx.restore();
}

/**
 * Computes and caches palisade/gate connections for a building.
 * Connections are cached on the building entity to avoid expensive spatial queries every frame.
 */
function getOrComputePalisadeConnections(
  building: BuildingEntity,
  indexedWorld: IndexedWorldState,
): PalisadeConnections {
  const { buildingType, ownerId, position, id } = building;

  // If not a palisade or gate, return empty connections
  if (buildingType !== BuildingType.Palisade && buildingType !== BuildingType.Gate) {
    return DEFAULT_CONNECTIONS;
  }

  // Check if we have valid cached connections
  // Connections are invalidated when buildings change (handled by buildingVersion in world state)
  const cachedVersion = (indexedWorld as { buildingVersion?: number }).buildingVersion ?? 0;
  if (building.cachedConnections && building.cachedConnections.computedAt === cachedVersion) {
    return building.cachedConnections;
  }

  // Compute new connections
  const { width: worldWidth, height: worldHeight } = indexedWorld.mapDimensions;
  const connections: PalisadeConnections = {
    connections: [],
    isInner: false,
    isVertical: false,
    wallAngle: 0,
    hasGateNeighbor: false,
  };

  // Search radius 55 to ensure we catch neighbors at 50px grid spacing
  const nearbyBuildings = indexedWorld.search.building.byRadius(position, 55);

  for (const neighbor of nearbyBuildings) {
    if (neighbor.id === id) continue;

    if (
      (neighbor.buildingType === BuildingType.Palisade || neighbor.buildingType === BuildingType.Gate) &&
      neighbor.ownerId === ownerId
    ) {
      const dir = getDirectionVectorOnTorus(position, neighbor.position, worldWidth, worldHeight);
      const dist = Math.sqrt(dir.x * dir.x + dir.y * dir.y);

      // Connection threshold: 15px to 55px
      if (dist >= 15 && dist <= 55) {
        connections.connections.push({
          angle: Math.atan2(dir.y, dir.x),
          distance: dist,
        });

        if (neighbor.buildingType === BuildingType.Gate) {
          connections.hasGateNeighbor = true;
        }
      }
    }
  }

  // Calculate wallAngle using axial averaging
  if (connections.connections.length > 0) {
    let sumX = 0;
    let sumY = 0;
    for (const conn of connections.connections) {
      sumX += Math.cos(conn.angle * 2);
      sumY += Math.sin(conn.angle * 2);
    }
    connections.wallAngle = Math.atan2(sumY, sumX) / 2;
  } else {
    connections.wallAngle = 0;
  }

  // Detect if the segment is vertical (Side Profile)
  connections.isVertical = connections.connections.length > 0 && Math.abs(Math.sin(connections.wallAngle)) > 0.9;

  // Inner/Outer Detection using Perspective Sampling
  if (ownerId !== null && ownerId !== undefined) {
    const getOwnerOfPoint = (px: number, py: number): EntityId | null => {
      const wrappedX = ((px % worldWidth) + worldWidth) % worldWidth;
      const wrappedY = ((py % worldHeight) + worldHeight) % worldHeight;
      const gx = Math.floor(wrappedX / TERRITORY_OWNERSHIP_RESOLUTION);
      const gy = Math.floor(wrappedY / TERRITORY_OWNERSHIP_RESOLUTION);
      const gridWidth = Math.ceil(worldWidth / TERRITORY_OWNERSHIP_RESOLUTION);
      return indexedWorld.terrainOwnership[gy * gridWidth + gx];
    };

    // Sample along the wall normal to detect which side is "inside"
    const normalAngle = connections.wallAngle + Math.PI / 2;
    const sampleX = position.x + Math.cos(normalAngle) * 20;
    const sampleY = position.y + Math.sin(normalAngle) * 20;

    const frontOwner = getOwnerOfPoint(sampleX, sampleY);
    if (frontOwner === ownerId) {
      connections.isInner = true;
    }
  }

  // Cache the connections on the building entity
  building.cachedConnections = {
    ...connections,
    computedAt: cachedVersion,
  };

  return connections;
}

/**
 * Renders a building entity.
 */
export function renderBuilding(
  ctx: CanvasRenderingContext2D,
  building: BuildingEntity,
  indexedWorld: IndexedWorldState,
): void {
  const {
    position,
    width,
    height,
    constructionProgress,
    destructionProgress,
    isConstructed,
    isBeingDestroyed,
  } = building;

  const player = findPlayerEntity(indexedWorld);
  const isHostile = !!(player && isEnemyBuilding(player, building, indexedWorld));

  // Use cached connections for palisades/gates to avoid expensive spatial queries every frame
  const connections = getOrComputePalisadeConnections(building, indexedWorld);

  const sprite = getBuildingSprite(building, isHostile, false, true, connections);

  ctx.save();
  if (!isConstructed) {
    ctx.globalAlpha = 0.3 + constructionProgress * 0.7;
  }

  ctx.drawImage(sprite, position.x - sprite.width / 2, position.y - sprite.height / 2);

  if (isBeingDestroyed && isConstructed) {
    ctx.translate(position.x, position.y);
    drawCracks(ctx, width, height, destructionProgress, building.id);
  }

  ctx.restore();

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

  const sprite = getBuildingSprite(
    { buildingType, width, height, id: 9999, ownerId: null },
    false,
    true,
    isValid,
    DEFAULT_CONNECTIONS,
  );

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
    stateMachine: ['', { enteredAt: 0 }],
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
