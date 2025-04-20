import { GameWorldState } from '../game-world/game-world-types';
import { getPlayerLion } from '../game-world/game-world-query';

// Constants for the hunger indicator
const ICON_WIDTH = 24; // Approx width for path definition
const ICON_HEIGHT = 32; // Approx height for path definition
const ICON_X = 20; // X position from left
const ICON_OUTLINE_COLOR = 'black';
const ICON_EMPTY_COLOR = '#606060'; // Dark grey for empty part
const ICON_FULL_COLOR = '#FF6347'; // Tomato red for full part
const BORDER_THICKNESS = 2; // Border thickness in pixels

export function drawHungerIndicator(ctx: CanvasRenderingContext2D, world: GameWorldState) {
  const lion = getPlayerLion(world);
  if (!lion) {
    return; // No lion, no hunger bar
  }

  const hungerLevel = lion.hungerLevel; // 0-100

  // Calculate Y position dynamically based on canvas height
  const ICON_Y = ctx.canvas.height - ICON_HEIGHT - 20; // Y position from bottom

  // Store original smoothing setting
  const originalSmoothing = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;

  // --- Define Stomach Path (Pixelated Style) ---
  // Adjust points for a more stomach-like, rounded shape
  // Using integer coordinates for pixelation
  const path = new Path2D();
  path.moveTo(ICON_X + 4, ICON_Y); // Top-left curve start
  path.quadraticCurveTo(ICON_X, ICON_Y, ICON_X, ICON_Y + 8); // Left side curve down
  path.quadraticCurveTo(ICON_X, ICON_Y + ICON_HEIGHT - 4, ICON_X + 8, ICON_Y + ICON_HEIGHT); // Bottom-left curve
  path.lineTo(ICON_X + ICON_WIDTH - 8, ICON_Y + ICON_HEIGHT); // Bottom line
  path.quadraticCurveTo(ICON_X + ICON_WIDTH, ICON_Y + ICON_HEIGHT - 4, ICON_X + ICON_WIDTH, ICON_Y + ICON_HEIGHT - 12); // Bottom-right curve
  path.quadraticCurveTo(ICON_X + ICON_WIDTH, ICON_Y + 4, ICON_X + ICON_WIDTH - 8, ICON_Y); // Top-right curve
  path.closePath(); // Close path back to top-left

  // --- Draw Outline ---
  ctx.fillStyle = ICON_OUTLINE_COLOR;
  ctx.fill(path);

  // --- Draw Background (Empty Part) ---
  // Use similar curve logic but inset by BORDER_THICKNESS
  // This requires careful recalculation of control points, or approximation
  // Let's try a simple rectangle inset first, then refine if needed.
  // Better: Use the outer path, clip, then draw background rect, then fill rect.

  ctx.save(); // Save context before clipping

  // Clip to the main path shape (excluding border)
  // Create a slightly smaller path for clipping to avoid drawing over the border
  // This is complex. Let's clip to the *outer* path and draw background *first*.
  const clipPath = new Path2D();
  clipPath.moveTo(ICON_X + 4 + BORDER_THICKNESS / 2, ICON_Y + BORDER_THICKNESS / 2); // Adjust start
  // Re-trace path slightly inset - Approximation for now
  clipPath.quadraticCurveTo(
    ICON_X + BORDER_THICKNESS,
    ICON_Y + BORDER_THICKNESS,
    ICON_X + BORDER_THICKNESS,
    ICON_Y + 8,
  );
  clipPath.quadraticCurveTo(
    ICON_X + BORDER_THICKNESS,
    ICON_Y + ICON_HEIGHT - 4 - BORDER_THICKNESS,
    ICON_X + 8,
    ICON_Y + ICON_HEIGHT - BORDER_THICKNESS,
  );
  clipPath.lineTo(ICON_X + ICON_WIDTH - 8, ICON_Y + ICON_HEIGHT - BORDER_THICKNESS);
  clipPath.quadraticCurveTo(
    ICON_X + ICON_WIDTH - BORDER_THICKNESS,
    ICON_Y + ICON_HEIGHT - 4 - BORDER_THICKNESS,
    ICON_X + ICON_WIDTH - BORDER_THICKNESS,
    ICON_Y + ICON_HEIGHT - 12,
  );
  clipPath.quadraticCurveTo(
    ICON_X + ICON_WIDTH - BORDER_THICKNESS,
    ICON_Y + 4 + BORDER_THICKNESS,
    ICON_X + ICON_WIDTH - 8,
    ICON_Y + BORDER_THICKNESS,
  );
  clipPath.closePath();

  ctx.clip(clipPath); // Apply clipping mask

  // Draw the empty background color covering the whole clipped area
  ctx.fillStyle = ICON_EMPTY_COLOR;
  ctx.fillRect(ICON_X, ICON_Y, ICON_WIDTH, ICON_HEIGHT); // Draw over clipped area

  // --- Draw Fill Level (Full Part) ---
  const fillPercentage = Math.max(0, Math.min(100, hungerLevel)) / 100;
  const fillHeight = Math.round((ICON_HEIGHT - BORDER_THICKNESS * 2) * fillPercentage);
  const fillY = ICON_Y + ICON_HEIGHT - BORDER_THICKNESS - fillHeight; // Calculate Y position for fill (from bottom)

  if (fillHeight > 0) {
    ctx.fillStyle = ICON_FULL_COLOR;
    // Draw a rectangle covering the bottom part of the clipped area
    ctx.fillRect(
      ICON_X + BORDER_THICKNESS, // Start inside the border
      fillY,
      ICON_WIDTH - BORDER_THICKNESS * 2, // Stay inside the border
      fillHeight,
    );
  }

  ctx.restore(); // Restore context to remove clipping mask

  // Restore original smoothing setting
  ctx.imageSmoothingEnabled = originalSmoothing;
}
