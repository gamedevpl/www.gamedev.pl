/**
 * Renders planting zones using a 2D metaballs approach.
 * Adjacent planting zones belonging to the same tribe are visually joined
 * with smooth, organic edges using metaball field calculations.
 * Stone borders are rendered around the continuous metaball boundary.
 */

import { BuildingEntity } from '../entities/buildings/building-types';
import { BuildingType, BUILDING_DEFINITIONS } from '../building-consts';
import { GameWorldState } from '../world-types';
import { IndexedWorldState } from '../world-index/world-index-types';
import { Vector2D } from '../utils/math-types';
import { EntityId } from '../entities/entities-types';
import { HumanEntity } from '../entities/characters/human/human-types';

// Metaball rendering constants
const METABALL_THRESHOLD = 1.0; // Field strength threshold for rendering
const METABALL_PADDING = 20; // Extra padding around zones for smooth edges
const FIELD_SAMPLE_STEP = 4; // Pixel step for field sampling (lower = higher quality, slower)
const STONE_SPACING = 8; // Spacing between stones along the border

/**
 * Groups planting zones by their owner (tribe leader).
 */
function groupZonesByOwner(zones: BuildingEntity[]): Map<EntityId, BuildingEntity[]> {
  const groups = new Map<EntityId, BuildingEntity[]>();
  
  for (const zone of zones) {
    const ownerId = zone.ownerId;
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
 * Renders a group of planting zones using the metaball technique.
 * Creates a smooth, organic shape that blends adjacent zones together.
 * Also renders stones along the continuous metaball boundary.
 */
function renderMetaballGroup(
  ctx: CanvasRenderingContext2D,
  zones: BuildingEntity[],
  dimensions: { width: number; height: number },
  isHostile: boolean,
  groupSeed: number,
): void {
  if (zones.length === 0) return;
  
  const bounds = getGroupBounds(zones, dimensions, METABALL_PADDING);
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  
  // Create an offscreen canvas for the metaball rendering
  const offscreenCanvas = document.createElement('canvas');
  offscreenCanvas.width = Math.ceil(width / FIELD_SAMPLE_STEP);
  offscreenCanvas.height = Math.ceil(height / FIELD_SAMPLE_STEP);
  const offCtx = offscreenCanvas.getContext('2d')!;
  
  // Create image data for pixel manipulation
  const imageData = offCtx.createImageData(offscreenCanvas.width, offscreenCanvas.height);
  const data = imageData.data;
  
  // Store field values for edge detection
  const fieldValues: number[][] = [];
  for (let py = 0; py < offscreenCanvas.height; py++) {
    fieldValues[py] = [];
  }
  
  // Sample the field at each pixel
  for (let py = 0; py < offscreenCanvas.height; py++) {
    for (let px = 0; px < offscreenCanvas.width; px++) {
      const worldX = bounds.minX + px * FIELD_SAMPLE_STEP;
      const worldY = bounds.minY + py * FIELD_SAMPLE_STEP;
      
      const fieldStrength = calculateFieldStrength(worldX, worldY, zones, dimensions);
      fieldValues[py][px] = fieldStrength;
      
      if (fieldStrength > METABALL_THRESHOLD) {
        const i = (py * offscreenCanvas.width + px) * 4;
        
        if (isHostile) {
          // Reddish tint for hostile zones
          data[i] = 139;     // R
          data[i + 1] = 50;  // G
          data[i + 2] = 50;  // B
        } else {
          // Brownish earth tone
          data[i] = 139;     // R
          data[i + 1] = 90;  // G
          data[i + 2] = 43;  // B
        }
        
        // Calculate alpha based on field strength for smoother edges
        const edgeSoftness = Math.min(1, (fieldStrength - METABALL_THRESHOLD) * 2);
        data[i + 3] = Math.floor(edgeSoftness * 100); // Semi-transparent
      }
    }
  }
  
  offCtx.putImageData(imageData, 0, 0);
  
  // Draw the metaball shape to the main canvas, scaled up
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(
    offscreenCanvas,
    bounds.minX,
    bounds.minY,
    width,
    height,
  );
  ctx.restore();
  
  // Find and render stones along the metaball boundary
  renderMetaballBorder(ctx, fieldValues, bounds, isHostile, groupSeed);
}

/**
 * Finds edge pixels where the field crosses the threshold and renders stones along them.
 */
function renderMetaballBorder(
  ctx: CanvasRenderingContext2D,
  fieldValues: number[][],
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  isHostile: boolean,
  seed: number,
): void {
  const edgePoints: Vector2D[] = [];
  
  // Find edge pixels (where field crosses the threshold)
  for (let py = 1; py < fieldValues.length - 1; py++) {
    for (let px = 1; px < fieldValues[py].length - 1; px++) {
      const current = fieldValues[py][px];
      
      // Check if this pixel is on the edge (inside but has outside neighbor)
      if (current >= METABALL_THRESHOLD) {
        const neighbors = [
          fieldValues[py - 1][px],     // top
          fieldValues[py + 1][px],     // bottom
          fieldValues[py][px - 1],     // left
          fieldValues[py][px + 1],     // right
        ];
        
        // If any neighbor is outside the threshold, this is an edge pixel
        const isEdge = neighbors.some(n => n < METABALL_THRESHOLD);
        
        if (isEdge) {
          const worldX = bounds.minX + px * FIELD_SAMPLE_STEP;
          const worldY = bounds.minY + py * FIELD_SAMPLE_STEP;
          edgePoints.push({ x: worldX, y: worldY });
        }
      }
    }
  }
  
  // Sort edge points to form a continuous path (simple nearest-neighbor approach)
  const sortedPoints = sortEdgePoints(edgePoints);
  
  // Place stones at regular intervals along the edge
  renderStonesAlongPath(ctx, sortedPoints, isHostile, seed);
}

/**
 * Sorts edge points to form a more continuous path using nearest-neighbor.
 */
function sortEdgePoints(points: Vector2D[]): Vector2D[] {
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
    
    // Only add if reasonably close (to handle disconnected regions)
    if (nearestDist < FIELD_SAMPLE_STEP * FIELD_SAMPLE_STEP * 4) {
      sorted.push(remaining.splice(nearestIndex, 1)[0]);
    } else {
      // Start a new segment - just continue with remaining points
      sorted.push(remaining.shift()!);
    }
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
      const t = 1 - (accumulatedDist / segmentDist);
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
function renderStone(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  isHostile: boolean,
  seed: number,
): void {
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
 * Simple pseudo-random number generator.
 */
function pseudoRandom(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
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
  
  const dimensions = BUILDING_DEFINITIONS[BuildingType.PlantingZone].dimensions;
  const zonesByOwner = groupZonesByOwner(plantingZones);
  
  // Get player's tribe leader to determine hostility
  const player = playerLeaderId 
    ? gameState.entities.entities[playerLeaderId] as HumanEntity | undefined
    : undefined;
  
  // Render each group's metaball shape with continuous stone border
  for (const [ownerId, zones] of zonesByOwner) {
    // Determine if this group is hostile to the player
    const isHostile = player?.tribeControl?.diplomacy?.[ownerId] === 'Hostile';
    
    // Use the owner ID as the seed for consistent stone placement
    const groupSeed = typeof ownerId === 'number' ? ownerId : 0;
    
    // Render metaball fill and continuous stone border for the group
    renderMetaballGroup(ctx, zones, dimensions, isHostile, groupSeed);
  }
}

/**
 * Renders a single planting zone icon (emoji) at the center.
 */
export function renderPlantingZoneIcon(
  ctx: CanvasRenderingContext2D,
  zone: BuildingEntity,
): void {
  const definition = BUILDING_DEFINITIONS[BuildingType.PlantingZone];
  const { position, width, height } = zone;
  
  ctx.save();
  ctx.translate(position.x, position.y);
  
  ctx.globalAlpha = 0.5;
  ctx.font = `${Math.min(width, height, 30) * 0.5}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 4;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(definition.icon, 0, 0);
  ctx.shadowBlur = 0;
  
  ctx.restore();
}
