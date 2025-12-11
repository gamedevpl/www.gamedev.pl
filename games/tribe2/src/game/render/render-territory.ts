/**
 * Rendering functions for tribe territory borders.
 * Provides subtle visual indication of tribe boundaries using metaballs approach.
 */

import { GameWorldState } from '../world-types';
import { Vector2D } from '../utils/math-types';
import { calculateAllTerritories } from '../entities/tribe/territory-utils';
import { TribeTerritory, TerritoryCircle } from '../entities/tribe/territory-types';
import {
  TERRITORY_BORDER_ALPHA,
  TERRITORY_BORDER_LINE_WIDTH,
  TERRITORY_BORDER_DASH_PATTERN,
  TERRITORY_BORDER_PULSE_SPEED,
  TERRITORY_COLORS,
  TERRITORY_BUILDING_RADIUS,
} from '../entities/tribe/territory-consts';
import { EntityId } from '../entities/entities-types';

/** Threshold for metaball field - points above this are inside the territory */
const METABALL_THRESHOLD = 1.0;

/** Resolution for marching squares grid (smaller = smoother but slower) */
const MARCHING_SQUARES_RESOLUTION = 15;

/**
 * Calculate the metaball field value at a given point.
 * Uses the sum of (radius^2 / distance^2) for each circle.
 */
function calculateMetaballField(
  x: number,
  y: number,
  circles: TerritoryCircle[],
  worldWidth: number,
  worldHeight: number,
): number {
  let fieldValue = 0;

  for (const circle of circles) {
    // Calculate wrapped distance to handle toroidal world
    let dx = x - circle.center.x;
    let dy = y - circle.center.y;

    // Handle world wrapping
    if (Math.abs(dx) > worldWidth / 2) {
      dx = dx > 0 ? dx - worldWidth : dx + worldWidth;
    }
    if (Math.abs(dy) > worldHeight / 2) {
      dy = dy > 0 ? dy - worldHeight : dy + worldHeight;
    }

    const distSquared = dx * dx + dy * dy;
    if (distSquared > 0) {
      // Metaball contribution: radius^2 / distance^2
      const radiusSquared = circle.radius * circle.radius;
      fieldValue += radiusSquared / distSquared;
    } else {
      // Point is exactly at circle center
      fieldValue += 1000; // Large value to ensure it's inside
    }
  }

  return fieldValue;
}

/**
 * Generate contour points using marching squares algorithm.
 * Returns an array of line segments that form the territory boundary.
 */
function generateMetaballContour(
  territory: TribeTerritory,
  worldWidth: number,
  worldHeight: number,
): Vector2D[][] {
  const circles = territory.circles;
  if (circles.length === 0) return [];

  // Calculate bounding box with some padding
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;

  for (const circle of circles) {
    minX = Math.min(minX, circle.center.x - circle.radius - 50);
    minY = Math.min(minY, circle.center.y - circle.radius - 50);
    maxX = Math.max(maxX, circle.center.x + circle.radius + 50);
    maxY = Math.max(maxY, circle.center.y + circle.radius + 50);
  }

  const width = maxX - minX;
  const height = maxY - minY;
  const cellSize = MARCHING_SQUARES_RESOLUTION;
  const cols = Math.ceil(width / cellSize) + 1;
  const rows = Math.ceil(height / cellSize) + 1;

  // Sample the field at grid points
  const field: number[][] = [];
  for (let j = 0; j < rows; j++) {
    field[j] = [];
    for (let i = 0; i < cols; i++) {
      const x = minX + i * cellSize;
      const y = minY + j * cellSize;
      field[j][i] = calculateMetaballField(x, y, circles, worldWidth, worldHeight);
    }
  }

  // Marching squares to find contour
  const segments: Vector2D[][] = [];

  for (let j = 0; j < rows - 1; j++) {
    for (let i = 0; i < cols - 1; i++) {
      const x = minX + i * cellSize;
      const y = minY + j * cellSize;

      // Get corner values
      const tl = field[j][i] >= METABALL_THRESHOLD ? 1 : 0;
      const tr = field[j][i + 1] >= METABALL_THRESHOLD ? 1 : 0;
      const br = field[j + 1][i + 1] >= METABALL_THRESHOLD ? 1 : 0;
      const bl = field[j + 1][i] >= METABALL_THRESHOLD ? 1 : 0;

      const caseIndex = tl * 8 + tr * 4 + br * 2 + bl;

      // Skip empty or full cells
      if (caseIndex === 0 || caseIndex === 15) continue;

      // Linear interpolation for smoother edges
      const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

      const getInterp = (v1: number, v2: number) => {
        if (Math.abs(v2 - v1) < 0.0001) return 0.5;
        return (METABALL_THRESHOLD - v1) / (v2 - v1);
      };

      // Edge midpoints with interpolation
      const top: Vector2D = {
        x: lerp(x, x + cellSize, getInterp(field[j][i], field[j][i + 1])),
        y: y,
      };
      const right: Vector2D = {
        x: x + cellSize,
        y: lerp(y, y + cellSize, getInterp(field[j][i + 1], field[j + 1][i + 1])),
      };
      const bottom: Vector2D = {
        x: lerp(x, x + cellSize, getInterp(field[j + 1][i], field[j + 1][i + 1])),
        y: y + cellSize,
      };
      const left: Vector2D = {
        x: x,
        y: lerp(y, y + cellSize, getInterp(field[j][i], field[j + 1][i])),
      };

      // Generate line segments based on case
      const addSegment = (p1: Vector2D, p2: Vector2D) => {
        segments.push([p1, p2]);
      };

      switch (caseIndex) {
        case 1:
          addSegment(left, bottom);
          break;
        case 2:
          addSegment(bottom, right);
          break;
        case 3:
          addSegment(left, right);
          break;
        case 4:
          addSegment(top, right);
          break;
        case 5:
          addSegment(top, left);
          addSegment(bottom, right);
          break;
        case 6:
          addSegment(top, bottom);
          break;
        case 7:
          addSegment(top, left);
          break;
        case 8:
          addSegment(top, left);
          break;
        case 9:
          addSegment(top, bottom);
          break;
        case 10:
          addSegment(top, right);
          addSegment(left, bottom);
          break;
        case 11:
          addSegment(top, right);
          break;
        case 12:
          addSegment(left, right);
          break;
        case 13:
          addSegment(bottom, right);
          break;
        case 14:
          addSegment(left, bottom);
          break;
      }
    }
  }

  return segments;
}

/**
 * Renders the territory border for a single tribe using metaballs approach.
 * Note: The canvas context is already translated to world coordinates when this is called.
 */
function renderSingleTerritoryBorder(
  ctx: CanvasRenderingContext2D,
  territory: TribeTerritory,
  gameState: GameWorldState,
  time: number,
  isPlayerTribe: boolean,
): void {
  const { width: worldWidth, height: worldHeight } = gameState.mapDimensions;

  if (territory.circles.length === 0) return;

  // Calculate pulsing alpha
  const pulse = (Math.sin(time * TERRITORY_BORDER_PULSE_SPEED) + 1) / 2;
  const alpha = TERRITORY_BORDER_ALPHA * (0.5 + pulse * 0.5);

  ctx.save();

  // Generate metaball contour
  const segments = generateMetaballContour(territory, worldWidth, worldHeight);

  // Set styling for border
  ctx.strokeStyle = territory.color;
  ctx.globalAlpha = alpha;
  ctx.lineWidth = isPlayerTribe ? TERRITORY_BORDER_LINE_WIDTH * 1.5 : TERRITORY_BORDER_LINE_WIDTH;
  ctx.setLineDash(TERRITORY_BORDER_DASH_PATTERN);

  // Draw the contour segments with world wrapping
  for (let dx = -worldWidth; dx <= worldWidth; dx += worldWidth) {
    for (let dy = -worldHeight; dy <= worldHeight; dy += worldHeight) {
      ctx.beginPath();
      for (const segment of segments) {
        ctx.moveTo(segment[0].x + dx, segment[0].y + dy);
        ctx.lineTo(segment[1].x + dx, segment[1].y + dy);
      }
      ctx.stroke();
    }
  }

  // Draw subtle fill using a different approach - sample points and fill
  const fillAlpha = alpha * 0.1;
  ctx.globalAlpha = fillAlpha;
  ctx.fillStyle = territory.color;

  // Create a path from the contour for filling
  // We'll use a simplified approach: draw filled circles at each metaball center
  // but with composite operation to create merged effect
  ctx.globalCompositeOperation = 'source-over';

  for (const circle of territory.circles) {
    for (let dx = -worldWidth; dx <= worldWidth; dx += worldWidth) {
      for (let dy = -worldHeight; dy <= worldHeight; dy += worldHeight) {
        ctx.beginPath();
        ctx.arc(circle.center.x + dx, circle.center.y + dy, circle.radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  ctx.restore();
}

/**
 * Renders all tribe territory borders.
 * This should be called before rendering entities to have borders appear behind them.
 * Note: The canvas context should already be translated to world coordinates.
 */
export function renderAllTerritories(
  ctx: CanvasRenderingContext2D,
  gameState: GameWorldState,
  _viewportCenter: Vector2D,
  _canvasDimensions: { width: number; height: number },
  time: number,
  playerLeaderId?: EntityId,
): void {
  const territories = calculateAllTerritories(gameState);

  // Sort territories so player's tribe is rendered last (on top)
  const sortedTerritories = Array.from(territories.entries()).sort(([idA], [idB]) => {
    if (idA === playerLeaderId) return 1;
    if (idB === playerLeaderId) return -1;
    return 0;
  });

  // Assign colors based on order, with player getting index 0
  let colorIndex = 1; // Start at 1, player gets 0
  for (const [leaderId, territory] of sortedTerritories) {
    const isPlayerTribe = leaderId === playerLeaderId;
    const tribeColorIndex = isPlayerTribe ? 0 : colorIndex++;
    territory.color = TERRITORY_COLORS[tribeColorIndex % TERRITORY_COLORS.length];

    renderSingleTerritoryBorder(
      ctx,
      territory,
      gameState,
      time,
      isPlayerTribe,
    );
  }
}

/**
 * Renders a preview of territory expansion when placing a building.
 * Shows where the territory would expand to if a building is placed.
 * Note: The canvas context should already be translated to world coordinates.
 */
export function renderTerritoryExpansionPreview(
  ctx: CanvasRenderingContext2D,
  position: Vector2D,
  gameState: GameWorldState,
  _viewportCenter: Vector2D,
  _canvasDimensions: { width: number; height: number },
  isValid: boolean,
): void {
  const { width: worldWidth, height: worldHeight } = gameState.mapDimensions;

  ctx.save();

  // Set styling for preview
  ctx.strokeStyle = isValid ? '#4CAF50' : '#F44336';
  ctx.globalAlpha = 0.4;
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 4]);

  // Handle world wrapping
  for (let dx = -worldWidth; dx <= worldWidth; dx += worldWidth) {
    for (let dy = -worldHeight; dy <= worldHeight; dy += worldHeight) {
      const wrappedX = position.x + dx;
      const wrappedY = position.y + dy;

      // Draw the expansion preview circle (in world coordinates)
      ctx.beginPath();
      ctx.arc(wrappedX, wrappedY, TERRITORY_BUILDING_RADIUS, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  ctx.restore();
}
