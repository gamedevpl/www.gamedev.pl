/**
 * Renders planting zones using a 2D metaballs approach.
 * Adjacent planting zones belonging to the same tribe are visually joined
 * with smooth, organic edges using metaball field calculations.
 * Stone borders are rendered around the continuous metaball boundary.
 * A subtle tint is applied to distinguish planting zones from regular grass.
 */

import { BuildingEntity } from '../entities/buildings/building-types';
import { BuildingType, BUILDING_DEFINITIONS } from '../entities/buildings/building-consts';
import { GameWorldState } from '../world-types';
import { IndexedWorldState } from '../world-index/world-index-types';
import { Vector2D } from '../utils/math-types';
import { EntityId } from '../entities/entities-types';
import { HumanEntity } from '../entities/characters/human/human-types';
import { isEntityInView, getOffscreenCanvas, pseudoRandom } from './render-utils';

// Metaball rendering constants
const METABALL_THRESHOLD = 1.0; // Field strength threshold for rendering
const METABALL_PADDING = 20; // Extra padding around zones for smooth edges
const FIELD_SAMPLE_STEP = 4; // Pixel step for field sampling (lower = higher quality, slower)
const STONE_SPACING = 8; // Spacing between stones along the border

// Fill color for planting zone area (subtle darker green tint to distinguish from grass)
const ZONE_FILL_COLOR = 'rgba(34, 85, 34, 0.25)'; // Dark green, semi-transparent
const ZONE_FILL_COLOR_HOSTILE = 'rgba(139, 50, 50, 0.25)'; // Reddish tint for hostile

// Cache for field calculations (zones don't move, so we can cache by zone IDs)
interface CachedFieldData {
  fieldValues: number[][];
  edgePoints: Vector2D[];
  regions: Vector2D[][];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  canvas?: HTMLCanvasElement;
}

const fieldDataCache = new Map<string, CachedFieldData>();
const MAX_CACHE_SIZE = 50; // Prevent unbounded growth

/**
 * Generates a cache key from a list of zone IDs and hostility status.
 */
function generateCacheKey(zones: BuildingEntity[], isHostile: boolean): string {
  return (
    zones
      .map((z) => z.id)
      .sort((a, b) => a - b)
      .join(',') + `_${isHostile}`
  );
}

/**
 * Manages cache size using simple LRU eviction.
 */
function manageCacheSize(): void {
  if (fieldDataCache.size > MAX_CACHE_SIZE) {
    // Remove oldest entry (first key in the map)
    const firstKey = fieldDataCache.keys().next().value;
    if (firstKey) fieldDataCache.delete(firstKey);
  }
}

/**
 * Groups planting zones by their owner (tribe leader).
 */
function groupZonesByOwner(zones: BuildingEntity[]): Map<EntityId, BuildingEntity[]> {
  const groups = new Map<EntityId, BuildingEntity[]>();

  for (const zone of zones) {
    const ownerId = zone.ownerId;
    if (!ownerId) {
      continue;
    }
    if (!groups.has(ownerId)) {
      groups.set(ownerId, []);
    }
    groups.get(ownerId)!.push(zone);
  }

  return groups;
}

/**
 * Calculates the metaball field strength at a given point.
 * Uses the classic metaball formula: sum of (radius^2 / distance^2) for each ball.
 */
function calculateFieldStrength(
  x: number,
  y: number,
  zones: BuildingEntity[],
  dimensions: { width: number; height: number },
): number {
  let fieldStrength = 0;
  const radius = Math.max(dimensions.width, dimensions.height) / 2;

  for (const zone of zones) {
    const dx = x - zone.position.x;
    const dy = y - zone.position.y;
    const distSq = dx * dx + dy * dy;

    if (distSq > 0) {
      // Use a softer falloff for more organic blending
      fieldStrength += (radius * radius) / distSq;
    } else {
      // At the exact center, return high value
      fieldStrength += 100;
    }
  }

  return fieldStrength;
}

/**
 * Gets the bounding box for a group of zones with padding.
 */
function getGroupBounds(
  zones: BuildingEntity[],
  dimensions: { width: number; height: number },
  padding: number,
): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const zone of zones) {
    minX = Math.min(minX, zone.position.x - dimensions.width / 2);
    minY = Math.min(minY, zone.position.y - dimensions.height / 2);
    maxX = Math.max(maxX, zone.position.x + dimensions.width / 2);
    maxY = Math.max(maxY, zone.position.y + dimensions.height / 2);
  }

  return {
    minX: minX - padding,
    minY: minY - padding,
    maxX: maxX + padding,
    maxY: maxY + padding,
  };
}

/**
 * Gets cached field data or computes it if not in cache.
 */
function getOrComputeFieldData(
  zones: BuildingEntity[],
  dimensions: { width: number; height: number },
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  isHostile: boolean,
): CachedFieldData {
  const cacheKey = generateCacheKey(zones, isHostile);

  // Check cache
  if (fieldDataCache.has(cacheKey)) {
    return fieldDataCache.get(cacheKey)!;
  }

  // Compute field data
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  const canvasWidth = Math.ceil(width / FIELD_SAMPLE_STEP);
  const canvasHeight = Math.ceil(height / FIELD_SAMPLE_STEP);

  const fieldValues: number[][] = [];
  const edgePoints: Vector2D[] = [];

  // Pre-allocate arrays
  for (let py = 0; py < canvasHeight; py++) {
    fieldValues[py] = new Array(canvasWidth);
  }

  // Calculate field values
  for (let py = 0; py < canvasHeight; py++) {
    for (let px = 0; px < canvasWidth; px++) {
      const worldX = bounds.minX + px * FIELD_SAMPLE_STEP;
      const worldY = bounds.minY + py * FIELD_SAMPLE_STEP;
      const fieldStrength = calculateFieldStrength(worldX, worldY, zones, dimensions);
      fieldValues[py][px] = fieldStrength;
    }
  }

  // Find edge points
  for (let py = 1; py < canvasHeight - 1; py++) {
    for (let px = 1; px < canvasWidth - 1; px++) {
      const current = fieldValues[py][px];

      if (current >= METABALL_THRESHOLD) {
        if (
          fieldValues[py - 1][px] < METABALL_THRESHOLD ||
          fieldValues[py + 1][px] < METABALL_THRESHOLD ||
          fieldValues[py][px - 1] < METABALL_THRESHOLD ||
          fieldValues[py][px + 1] < METABALL_THRESHOLD
        ) {
          const worldX = bounds.minX + px * FIELD_SAMPLE_STEP;
          const worldY = bounds.minY + py * FIELD_SAMPLE_STEP;
          edgePoints.push({ x: worldX, y: worldY });
        }
      }
    }
  }

  // Compute connected regions (expensive operation, cache it)
  const regions = findConnectedRegions(edgePoints);

  const cachedData: CachedFieldData = { fieldValues, edgePoints, regions, bounds };

  // Store in cache
  fieldDataCache.set(cacheKey, cachedData);
  manageCacheSize();

  return cachedData;
}

/**
 * Renders a group of planting zones using the metaball technique.
 * Renders a subtle tinted fill and stone border around the metaball boundary.
 */
function renderMetaballGroup(
  ctx: CanvasRenderingContext2D,
  zones: BuildingEntity[],
  _dimensions: { width: number; height: number },
  isHostile: boolean,
  groupSeed: number,
  fieldData: CachedFieldData,
): void {
  if (zones.length === 0) return;

  const { bounds } = fieldData;
  const padding = 10;

  if (!fieldData.canvas) {
    const canvasWidth = bounds.maxX - bounds.minX + padding * 2;
    const canvasHeight = bounds.maxY - bounds.minY + padding * 2;

    const { canvas, ctx: offCtx } = getOffscreenCanvas(canvasWidth, canvasHeight);

    // Translate so (0,0) in offscreen canvas corresponds to (minX-padding, minY-padding) in world space
    offCtx.translate(-bounds.minX + padding, -bounds.minY + padding);

    const { fieldValues, regions } = fieldData;

    // Render the subtle fill for the metaball area
    renderMetaballFill(offCtx, fieldValues, bounds, isHostile);

    // Use cached connected regions and render stones for each
    let regionSeed = groupSeed;
    for (const region of regions) {
      const sortedPoints = sortEdgePointsInRegion(region);
      renderStonesAlongPath(offCtx, sortedPoints, isHostile, regionSeed);
      regionSeed += 1000;
    }

    fieldData.canvas = canvas;
  }

  // Draw the cached canvas
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.drawImage(fieldData.canvas, bounds.minX - padding, bounds.minY - padding);
  ctx.restore();
}

/**
 * Renders a subtle tinted fill for the metaball area.
 */
function renderMetaballFill(
  ctx: CanvasRenderingContext2D,
  fieldValues: number[][],
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  isHostile: boolean,
): void {
  const fillColor = isHostile ? ZONE_FILL_COLOR_HOSTILE : ZONE_FILL_COLOR;

  ctx.save();
  ctx.fillStyle = fillColor;
  ctx.beginPath();

  // Draw filled rectangles for pixels inside the threshold
  for (let py = 0; py < fieldValues.length; py++) {
    for (let px = 0; px < fieldValues[py].length; px++) {
      if (fieldValues[py][px] >= METABALL_THRESHOLD) {
        const worldX = bounds.minX + px * FIELD_SAMPLE_STEP;
        const worldY = bounds.minY + py * FIELD_SAMPLE_STEP;
        ctx.rect(worldX, worldY, FIELD_SAMPLE_STEP, FIELD_SAMPLE_STEP);
      }
    }
  }

  ctx.fill();
  ctx.restore();
}

/**
 * Finds connected regions of edge points using a clustering approach.
 * Points within MAX_NEIGHBOR_DIST of each other are considered connected.
 * Optimized with spatial grid for better performance.
 */
function findConnectedRegions(points: Vector2D[]): Vector2D[][] {
  if (points.length === 0) return [];

  const MAX_NEIGHBOR_DIST = FIELD_SAMPLE_STEP * 2;
  const CELL_SIZE = MAX_NEIGHBOR_DIST;

  // Build spatial grid for O(1) neighbor lookups
  const grid = new Map<string, number[]>();

  function getCellKey(x: number, y: number): string {
    const cx = Math.floor(x / CELL_SIZE);
    const cy = Math.floor(y / CELL_SIZE);
    return `${cx},${cy}`;
  }

  // Populate grid
  for (let i = 0; i < points.length; i++) {
    const key = getCellKey(points[i].x, points[i].y);
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key)!.push(i);
  }

  // Get neighbors from adjacent cells
  function getNeighborCandidates(x: number, y: number): number[] {
    const candidates: number[] = [];
    const cx = Math.floor(x / CELL_SIZE);
    const cy = Math.floor(y / CELL_SIZE);

    // Check 3x3 grid of cells
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const key = `${cx + dx},${cy + dy}`;
        const cell = grid.get(key);
        if (cell) candidates.push(...cell);
      }
    }
    return candidates;
  }

  const visited = new Set<number>();
  const regions: Vector2D[][] = [];
  const MAX_NEIGHBOR_DIST_SQ = MAX_NEIGHBOR_DIST * MAX_NEIGHBOR_DIST;

  for (let i = 0; i < points.length; i++) {
    if (visited.has(i)) continue;

    const region: Vector2D[] = [];
    const queue: number[] = [i];

    while (queue.length > 0) {
      const idx = queue.shift()!;
      if (visited.has(idx)) continue;

      visited.add(idx);
      region.push(points[idx]);

      // Use spatial grid for efficient neighbor lookup
      const candidates = getNeighborCandidates(points[idx].x, points[idx].y);
      for (const j of candidates) {
        if (visited.has(j)) continue;

        const dx = points[j].x - points[idx].x;
        const dy = points[j].y - points[idx].y;
        const distSq = dx * dx + dy * dy;

        if (distSq <= MAX_NEIGHBOR_DIST_SQ) {
          queue.push(j);
        }
      }
    }

    if (region.length > 0) {
      regions.push(region);
    }
  }

  return regions;
}

/**
 * Sorts edge points within a single connected region to form a continuous path.
 * Uses nearest-neighbor within the region only.
 */
function sortEdgePointsInRegion(points: Vector2D[]): Vector2D[] {
  if (points.length <= 1) return points;

  const sorted: Vector2D[] = [];
  const remaining = [...points];

  // Start with the first point
  sorted.push(remaining.shift()!);

  while (remaining.length > 0) {
    const last = sorted[sorted.length - 1];

    // Find the nearest remaining point
    let nearestIndex = 0;
    let nearestDist = Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const dx = remaining[i].x - last.x;
      const dy = remaining[i].y - last.y;
      const dist = dx * dx + dy * dy;

      if (dist < nearestDist) {
        nearestDist = dist;
        nearestIndex = i;
      }
    }

    sorted.push(remaining.splice(nearestIndex, 1)[0]);
  }

  return sorted;
}

/**
 * Renders stones at regular intervals along a path of points.
 */
function renderStonesAlongPath(
  ctx: CanvasRenderingContext2D,
  points: Vector2D[],
  isHostile: boolean,
  seed: number,
): void {
  if (points.length === 0) return;

  let accumulatedDist = 0;
  let stoneIndex = 0;

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];

    const dx = curr.x - prev.x;
    const dy = curr.y - prev.y;
    const segmentDist = Math.sqrt(dx * dx + dy * dy);

    accumulatedDist += segmentDist;

    // Place stones at regular intervals
    while (accumulatedDist >= STONE_SPACING) {
      accumulatedDist -= STONE_SPACING;

      // Calculate position along the segment
      const t = 1 - accumulatedDist / segmentDist;
      const stoneX = prev.x + dx * t;
      const stoneY = prev.y + dy * t;

      // Render the stone
      renderStone(ctx, stoneX, stoneY, isHostile, seed + stoneIndex * 13);
      stoneIndex++;
    }
  }
}

/**
 * Renders a single stone at the given position.
 */
function renderStone(ctx: CanvasRenderingContext2D, x: number, y: number, isHostile: boolean, seed: number): void {
  const randSize = pseudoRandom(seed);
  const randOffset = pseudoRandom(seed + 1);

  const wiggleX = (randOffset - 0.5) * 2;
  const wiggleY = (pseudoRandom(seed + 2) - 0.5) * 2;

  ctx.beginPath();
  const radius = 1.5 + randSize * 0.5;

  if (isHostile) {
    ctx.fillStyle = randSize > 0.5 ? '#FF4444' : '#8B0000';
  } else {
    ctx.fillStyle = randSize > 0.5 ? '#7e7e7e' : '#5a5a5a';
  }

  ctx.ellipse(x + wiggleX, y + wiggleY, radius, radius * 0.85, randOffset * Math.PI, 0, Math.PI * 2);
  ctx.fill();

  if (!isHostile) {
    ctx.strokeStyle = '#2b2b2b';
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }
}

/**
 * Renders all planting zones using the metaball approach.
 * Zones are grouped by owner and rendered together for smooth joining.
 * Stone borders are rendered around the continuous metaball boundary.
 */
export function renderPlantingZonesMetaball(
  ctx: CanvasRenderingContext2D,
  gameState: GameWorldState,
  _viewportCenter: Vector2D,
  playerLeaderId?: EntityId,
): void {
  const indexedState = gameState as IndexedWorldState;
  if (!indexedState.search?.building) return;

  const allBuildings = indexedState.search.building.all();
  const plantingZones = allBuildings.filter(
    (building) => building.buildingType === BuildingType.PlantingZone && building.isConstructed,
  );

  if (plantingZones.length === 0) return;

  // Apply frustum culling to only process visible zones
  const visibleZones = plantingZones.filter((zone) =>
    isEntityInView(
      zone,
      _viewportCenter,
      { width: ctx.canvas.width, height: ctx.canvas.height },
      gameState.mapDimensions,
    ),
  );

  if (visibleZones.length === 0) return;

  const dimensions = BUILDING_DEFINITIONS[BuildingType.PlantingZone].dimensions;
  const zonesByOwner = groupZonesByOwner(visibleZones);

  // Get player's tribe leader to determine hostility
  const player = playerLeaderId ? (gameState.entities.entities[playerLeaderId] as HumanEntity | undefined) : undefined;

  // Render each group's metaball shape with continuous stone border
  for (const [ownerId, zones] of zonesByOwner) {
    // Determine if this group is hostile to the player
    const isHostile = player?.tribeControl?.diplomacy?.[ownerId] === 'Hostile';

    // Use the owner ID as the seed for consistent stone placement
    const groupSeed = typeof ownerId === 'number' ? ownerId : 0;

    // Calculate bounds for this group
    const bounds = getGroupBounds(zones, dimensions, METABALL_PADDING);

    // Get or compute field data (uses cache)
    const fieldData = getOrComputeFieldData(zones, dimensions, bounds, isHostile);

    // Render metaball fill and continuous stone border for the group
    renderMetaballGroup(ctx, zones, dimensions, isHostile, groupSeed, fieldData);
  }
}
