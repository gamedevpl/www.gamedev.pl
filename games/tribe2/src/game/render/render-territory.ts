/**
 * Rendering functions for tribe territory borders.
 * Visualizes territory boundaries using border posts/flags like in Settlers 3.
 */

import { GameWorldState } from '../world-types';
import { Vector2D } from '../utils/math-types';
import { calculateAllTerritories } from '../entities/tribe/territory-utils';
import { TERRITORY_COLORS } from '../entities/tribe/territory-consts';
import { EntityId } from '../entities/entities-types';
import { HumanEntity } from '../entities/characters/human/human-types';
import { TerritoryCircle } from '../entities/tribe/territory-types';
import { IndexType } from '../world-index/world-index-types';
import { indexItems } from '../world-index/world-index-utils';
import { calculateWrappedDistance, vectorSubtract } from '../utils/math-utils';

/** Size of the border post flag */
const BORDER_POST_FLAG_SIZE = 8;

/** Height of the border post pole */
const BORDER_POST_POLE_HEIGHT = 12;

/** * Grid resolution for border detection.
 * Lower = smoother but slower. Higher = blockier but faster.
 * 20-30px is usually a good "Settlers" style balance.
 */
const TERRITORY_GRID_STEP = 24;

/**
 * Draw a single border post (flag on a pole) at the given position.
 */
function drawBorderPost(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, tribeBadge: string): void {
  // Draw the pole
  ctx.strokeStyle = '#5D4037'; // Brown pole
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y - BORDER_POST_POLE_HEIGHT);
  ctx.stroke();

  // Draw the flag (triangular pennant)
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - BORDER_POST_POLE_HEIGHT);
  ctx.lineTo(x + BORDER_POST_FLAG_SIZE, y - BORDER_POST_POLE_HEIGHT + BORDER_POST_FLAG_SIZE / 2);
  ctx.lineTo(x, y - BORDER_POST_POLE_HEIGHT + BORDER_POST_FLAG_SIZE);
  ctx.closePath();
  ctx.fill();

  // Draw badge/emoji on flag if provided
  if (tribeBadge) {
    ctx.font = '8px sans-serif';
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(tribeBadge, x + BORDER_POST_FLAG_SIZE / 2, y - BORDER_POST_POLE_HEIGHT + BORDER_POST_FLAG_SIZE / 2);
  }
}

/**
 * Helper to check if a point is within a specific territory.
 * Assumes territory object has a 'checkPoint' method or 'towers' array with radius.
 * Since the Territory type isn't fully defined in snippets, we use a generic radius check strategy
 * common to this genre.
 */
function getOwnerOfPoint(
  x: number,
  y: number,
  worldWidth: number,
  worldHeight: number,
  index: IndexType<{
    circle: TerritoryCircle;
    leaderId: EntityId;
  }>,
): EntityId | null {
  const rects = index.byRect({ left: x, top: y, right: x, bottom: y });
  for (const rect of rects) {
    const { circle, leaderId } = rect;
    const distance = calculateWrappedDistance({ x, y }, circle.center, worldWidth, worldHeight);
    if (distance <= circle.radius) {
      return leaderId;
    }
  }
  return null;
}

/**
 * Renders all tribe territory borders.
 * This should be called before rendering entities to have borders appear behind them.
 * Note: The canvas context should already be translated to world coordinates.
 */
export function renderAllTerritories(
  ctx: CanvasRenderingContext2D,
  gameState: GameWorldState,
  viewportCenter: Vector2D,
  canvasDimensions: { width: number; height: number },
  _time: number,
  playerLeaderId?: EntityId,
): void {
  const territories = calculateAllTerritories(gameState);

  // 1. Setup Badges & Colors
  const tribeBadges = new Map<EntityId, string>();
  for (const entityId of territories.keys()) {
    const human = gameState.entities.entities[entityId] as HumanEntity;
    if (human && human.leaderId && human.tribeBadge) {
      tribeBadges.set(human.leaderId, human.tribeBadge);
    }
  }

  // Assign colors (Priority to player)
  const sortedTerritories = Array.from(territories.entries()).sort(([idA], [idB]) => {
    if (idA === playerLeaderId) return 1;
    if (idB === playerLeaderId) return -1;
    return 0;
  });

  let colorIndex = 1;
  const territoryColors = new Map<EntityId, string>();

  for (const [leaderId, territory] of sortedTerritories) {
    const isPlayerTribe = leaderId === playerLeaderId;
    const tribeColorIndex = isPlayerTribe ? 0 : colorIndex++;
    const color = TERRITORY_COLORS[tribeColorIndex % TERRITORY_COLORS.length];

    // Store back into map for easy lookup later
    territory.color = color;
    territoryColors.set(leaderId, color);
  }

  // 2. Calculate Viewport Bounds
  // We only iterate the visible area + padding to ensure borders don't pop in/out
  const padding = TERRITORY_GRID_STEP * 2;
  const startX =
    Math.floor((viewportCenter.x - canvasDimensions.width / 2 - padding) / TERRITORY_GRID_STEP) * TERRITORY_GRID_STEP;
  const endX =
    Math.floor((viewportCenter.x + canvasDimensions.width / 2 + padding) / TERRITORY_GRID_STEP) * TERRITORY_GRID_STEP;
  const startY =
    Math.floor((viewportCenter.y - canvasDimensions.height / 2 - padding) / TERRITORY_GRID_STEP) * TERRITORY_GRID_STEP;
  const endY =
    Math.floor((viewportCenter.y + canvasDimensions.height / 2 + padding) / TERRITORY_GRID_STEP) * TERRITORY_GRID_STEP;

  // 3. Index territories for quick lookup
  const index = indexItems(
    [...territories.entries()].flatMap(([leaderId, territory]) =>
      territory.circles.map((circle) => ({
        position: vectorSubtract(circle.center, { x: circle.radius, y: circle.radius }),
        width: circle.radius * 2,
        height: circle.radius * 2,
        circle,
        leaderId,
      })),
    ),
  );

  // 3. Marching Grid Algorithm (Edge Detection)
  // We check the owner of the current point, and compare it to the Right and Down neighbors.

  for (let y = startY; y <= endY; y += TERRITORY_GRID_STEP) {
    for (let x = startX; x <= endX; x += TERRITORY_GRID_STEP) {
      const currentOwner = getOwnerOfPoint(x, y, gameState.mapDimensions.width, gameState.mapDimensions.height, index);

      // -- Check Horizontal Edge (Current vs Right) --
      const nextX = x + TERRITORY_GRID_STEP;
      const rightOwner = getOwnerOfPoint(
        nextX,
        y,
        gameState.mapDimensions.width,
        gameState.mapDimensions.height,
        index,
      );
      if (currentOwner !== rightOwner) {
        // If one is null and other is valid, draw the valid one's border
        // If both are valid (War border), we can draw one or both. Here we draw the one that "starts" the edge relative to scan direction
        const ownerToDraw = currentOwner || rightOwner;

        if (ownerToDraw) {
          drawBorderPost(
            ctx,
            x + TERRITORY_GRID_STEP / 2, // Draw at midpoint
            y,
            territoryColors.get(ownerToDraw) || '#000',
            tribeBadges.get(ownerToDraw) || '',
          );
        }
      }

      // -- Check Vertical Edge (Current vs Down) --
      const nextY = y + TERRITORY_GRID_STEP;
      const downOwner = getOwnerOfPoint(x, nextY, gameState.mapDimensions.width, gameState.mapDimensions.height, index);

      if (currentOwner !== downOwner) {
        const ownerToDraw = currentOwner || downOwner;

        if (ownerToDraw) {
          drawBorderPost(
            ctx,
            x,
            y + TERRITORY_GRID_STEP / 2, // Draw at midpoint
            territoryColors.get(ownerToDraw) || '#000',
            tribeBadges.get(ownerToDraw) || '',
          );
        }
      }
    }
  }
}
