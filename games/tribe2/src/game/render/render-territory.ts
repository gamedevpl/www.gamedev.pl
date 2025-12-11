/**
 * Rendering functions for tribe territory borders.
 * Provides subtle visual indication of tribe boundaries.
 */

import { GameWorldState } from '../world-types';
import { Vector2D } from '../utils/math-types';
import { calculateAllTerritories } from '../entities/tribe/territory-utils';
import { TribeTerritory } from '../entities/tribe/territory-types';
import {
  TERRITORY_BORDER_ALPHA,
  TERRITORY_BORDER_LINE_WIDTH,
  TERRITORY_BORDER_DASH_PATTERN,
  TERRITORY_BORDER_PULSE_SPEED,
  TERRITORY_COLORS,
  TERRITORY_BUILDING_RADIUS,
} from '../entities/tribe/territory-consts';
import { EntityId } from '../entities/entities-types';

/**
 * Renders the territory border for a single tribe.
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

  // Calculate pulsing alpha
  const pulse = (Math.sin(time * TERRITORY_BORDER_PULSE_SPEED) + 1) / 2;
  const alpha = TERRITORY_BORDER_ALPHA * (0.5 + pulse * 0.5);

  ctx.save();

  // Set styling
  ctx.strokeStyle = territory.color;
  ctx.globalAlpha = alpha;
  ctx.lineWidth = isPlayerTribe ? TERRITORY_BORDER_LINE_WIDTH * 1.5 : TERRITORY_BORDER_LINE_WIDTH;
  ctx.setLineDash(TERRITORY_BORDER_DASH_PATTERN);

  // Also add a subtle fill for the territory
  ctx.fillStyle = territory.color;
  const fillAlpha = alpha * 0.15; // Subtle fill

  // Draw each circle in the territory with world wrapping
  for (const circle of territory.circles) {
    // Handle world wrapping by drawing at multiple positions
    for (let dx = -worldWidth; dx <= worldWidth; dx += worldWidth) {
      for (let dy = -worldHeight; dy <= worldHeight; dy += worldHeight) {
        const wrappedX = circle.center.x + dx;
        const wrappedY = circle.center.y + dy;

        // Draw the border circle (in world coordinates - context is already translated)
        ctx.beginPath();
        ctx.arc(wrappedX, wrappedY, circle.radius, 0, Math.PI * 2);
        ctx.stroke();

        // Draw subtle fill
        ctx.globalAlpha = fillAlpha;
        ctx.fill();
        ctx.globalAlpha = alpha;
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
