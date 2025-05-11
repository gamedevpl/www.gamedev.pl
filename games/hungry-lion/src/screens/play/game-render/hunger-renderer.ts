import { GameWorldState } from '../game-world/game-world-types';
import { getPlayerLion } from '../game-world/game-world-query';
import { ACTION_BAR_BOTTOM_MARGIN, getActionBarLayout, ACTION_BUTTON_HEIGHT } from './action-bar-renderer'; // Import layout info

// Original constants for scaling reference
const ORIGINAL_ICON_WIDTH = 24;
const ORIGINAL_ICON_HEIGHT = 32;
const ORIGINAL_BORDER_THICKNESS = 2;

// Pulse animation constants
const PULSE_HUNGER_THRESHOLD = 25; // Below this hunger level, icon starts pulsing
const PULSE_FREQUENCY = 0.005; // Speed of the pulse (rad/ms)
const PULSE_AMPLITUDE = 0.05; // Max size increase/decrease factor (e.g., 0.05 for 5%)

const ICON_OUTLINE_COLOR = 'black';
const ICON_EMPTY_COLOR = '#606060'; // Dark grey for empty part
const ICON_FULL_COLOR = '#FF6347'; // Tomato red for full part
const HUNGER_INDICATOR_RIGHT_MARGIN = 15; // Space between hunger icon and action bar

export function drawHungerIndicator(
  ctx: CanvasRenderingContext2D,
  world: GameWorldState,
  canvasWidth: number,
  canvasHeight: number,
) {
  const lion = getPlayerLion(world);
  if (!lion) {
    return; // No lion, no hunger bar
  }

  const hungerLevel = lion.hungerLevel; // 0-100

  // Calculate base dimensions
  const baseIconHeight = ACTION_BUTTON_HEIGHT; 
  const baseIconWidth = Math.round(ORIGINAL_ICON_WIDTH * (baseIconHeight / ORIGINAL_ICON_HEIGHT));
  const baseBorderThickness = Math.round(ORIGINAL_BORDER_THICKNESS * (baseIconHeight / ORIGINAL_ICON_HEIGHT));

  // Calculate base position
  const actionBarLayout = getActionBarLayout(canvasWidth, canvasHeight);
  const baseIconX = actionBarLayout.startX - baseIconWidth - HUNGER_INDICATOR_RIGHT_MARGIN;
  const baseIconY = canvasHeight - ACTION_BAR_BOTTOM_MARGIN - baseIconHeight;

  // Initialize final dimensions/positions with base values
  let finalIconWidth = baseIconWidth;
  let finalIconHeight = baseIconHeight;
  let finalIconX = baseIconX;
  let finalIconY = baseIconY;
  let finalBorderThickness = baseBorderThickness;

  // Add pulsing logic
  if (hungerLevel < PULSE_HUNGER_THRESHOLD) {
    const pulseFactor = 1 + PULSE_AMPLITUDE * Math.sin(world.time * PULSE_FREQUENCY);
    finalIconWidth = Math.round(baseIconWidth * pulseFactor);
    finalIconHeight = Math.round(baseIconHeight * pulseFactor);
    // Adjust X and Y to keep the icon centered as it pulses
    finalIconX = baseIconX - (finalIconWidth - baseIconWidth) / 2;
    finalIconY = baseIconY - (finalIconHeight - baseIconHeight) / 2;
    // Recalculate border thickness based on the final (pulsed) height
    finalBorderThickness = Math.round(ORIGINAL_BORDER_THICKNESS * (finalIconHeight / ORIGINAL_ICON_HEIGHT));
  }

  // Store original smoothing setting
  const originalSmoothing = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;

  // Scaling factors based on final (potentially pulsed) design
  const scaleX = finalIconWidth / ORIGINAL_ICON_WIDTH;
  const scaleY = finalIconHeight / ORIGINAL_ICON_HEIGHT;

  // Original path coordinates (relative to 0,0 for a ORIGINAL_ICON_WIDTH x ORIGINAL_ICON_HEIGHT box)
  const p_moveTo = { x: 4, y: 0 };
  const p_qc1_ctrl = { x: 0, y: 0 };
  const p_qc1_end = { x: 0, y: 8 };
  const p_qc2_ctrl = { x: 0, y: ORIGINAL_ICON_HEIGHT - 4 }; // 28
  const p_qc2_end = { x: 8, y: ORIGINAL_ICON_HEIGHT }; // 32
  const p_lineTo = { x: ORIGINAL_ICON_WIDTH - 8, y: ORIGINAL_ICON_HEIGHT }; // 16, 32
  const p_qc3_ctrl = { x: ORIGINAL_ICON_WIDTH, y: ORIGINAL_ICON_HEIGHT - 4 }; // 24, 28
  const p_qc3_end = { x: ORIGINAL_ICON_WIDTH, y: ORIGINAL_ICON_HEIGHT - 12 }; // 24, 20
  const p_qc4_ctrl = { x: ORIGINAL_ICON_WIDTH, y: 4 }; // 24, 4
  const p_qc4_end = { x: ORIGINAL_ICON_WIDTH - 8, y: 0 }; // 16, 0

  // --- Define Stomach Path (Pixelated Style) ---
  const path = new Path2D();
  path.moveTo(finalIconX + Math.round(p_moveTo.x * scaleX), finalIconY + Math.round(p_moveTo.y * scaleY));
  path.quadraticCurveTo(
    finalIconX + Math.round(p_qc1_ctrl.x * scaleX), finalIconY + Math.round(p_qc1_ctrl.y * scaleY),
    finalIconX + Math.round(p_qc1_end.x * scaleX), finalIconY + Math.round(p_qc1_end.y * scaleY)
  );
  path.quadraticCurveTo(
    finalIconX + Math.round(p_qc2_ctrl.x * scaleX), finalIconY + Math.round(p_qc2_ctrl.y * scaleY),
    finalIconX + Math.round(p_qc2_end.x * scaleX), finalIconY + Math.round(p_qc2_end.y * scaleY)
  );
  path.lineTo(finalIconX + Math.round(p_lineTo.x * scaleX), finalIconY + Math.round(p_lineTo.y * scaleY));
  path.quadraticCurveTo(
    finalIconX + Math.round(p_qc3_ctrl.x * scaleX), finalIconY + Math.round(p_qc3_ctrl.y * scaleY),
    finalIconX + Math.round(p_qc3_end.x * scaleX), finalIconY + Math.round(p_qc3_end.y * scaleY)
  );
  path.quadraticCurveTo(
    finalIconX + Math.round(p_qc4_ctrl.x * scaleX), finalIconY + Math.round(p_qc4_ctrl.y * scaleY),
    finalIconX + Math.round(p_qc4_end.x * scaleX), finalIconY + Math.round(p_qc4_end.y * scaleY)
  );
  path.closePath(); // Close path back to top-left

  // --- Draw Outline ---
  ctx.fillStyle = ICON_OUTLINE_COLOR;
  ctx.fill(path);

  // --- Draw Background (Empty Part) ---
  ctx.save(); // Save context before clipping

  const inset = finalBorderThickness; // Use the new scaled finalBorderThickness
  const clipPath = new Path2D();

  // Define inset path points by adjusting scaled base points with the new 'inset'
  clipPath.moveTo(finalIconX + Math.round(p_moveTo.x * scaleX) + inset / 2, finalIconY + Math.round(p_moveTo.y * scaleY) + inset / 2);
  clipPath.quadraticCurveTo(
    finalIconX + Math.round(p_qc1_ctrl.x * scaleX) + inset, finalIconY + Math.round(p_qc1_ctrl.y * scaleY) + inset,
    finalIconX + Math.round(p_qc1_end.x * scaleX) + inset, finalIconY + Math.round(p_qc1_end.y * scaleY) + inset / 2
  );
  clipPath.quadraticCurveTo(
    finalIconX + Math.round(p_qc2_ctrl.x * scaleX) + inset, finalIconY + Math.round(p_qc2_ctrl.y * scaleY) - inset,
    finalIconX + Math.round(p_qc2_end.x * scaleX) + inset / 2, finalIconY + Math.round(p_qc2_end.y * scaleY) - inset
  );
  clipPath.lineTo(
    finalIconX + Math.round(p_lineTo.x * scaleX) - inset / 2, 
    finalIconY + Math.round(p_lineTo.y * scaleY) - inset
  );
  clipPath.quadraticCurveTo(
    finalIconX + Math.round(p_qc3_ctrl.x * scaleX) - inset, finalIconY + Math.round(p_qc3_ctrl.y * scaleY) - inset,
    finalIconX + Math.round(p_qc3_end.x * scaleX) - inset, finalIconY + Math.round(p_qc3_end.y * scaleY) - inset / 2
  );
  clipPath.quadraticCurveTo(
    finalIconX + Math.round(p_qc4_ctrl.x * scaleX) - inset, finalIconY + Math.round(p_qc4_ctrl.y * scaleY) + inset,
    finalIconX + Math.round(p_qc4_end.x * scaleX) - inset / 2, finalIconY + Math.round(p_qc4_end.y * scaleY) + inset
  );
  clipPath.closePath();

  ctx.clip(clipPath); // Apply clipping mask

  // Draw the empty background color covering the whole clipped area
  ctx.fillStyle = ICON_EMPTY_COLOR;
  ctx.fillRect(finalIconX, finalIconY, finalIconWidth, finalIconHeight); // Draw over clipped area

  // --- Draw Fill Level (Full Part) ---
  const fillPercentage = Math.max(0, Math.min(100, hungerLevel)) / 100;
  // Ensure fillHeight calculation respects the new finalBorderThickness
  const fillHeight = Math.round((finalIconHeight - finalBorderThickness * 2) * fillPercentage);
  const fillY = finalIconY + finalIconHeight - finalBorderThickness - fillHeight; // Calculate Y position for fill (from bottom)

  if (fillHeight > 0) {
    ctx.fillStyle = ICON_FULL_COLOR;
    // Draw a rectangle covering the bottom part of the clipped area, respecting border
    ctx.fillRect(
      finalIconX + finalBorderThickness,
      fillY,
      finalIconWidth - finalBorderThickness * 2,
      fillHeight,
    );
  }

  ctx.restore(); // Restore context to remove clipping mask

  // Restore original smoothing setting
  ctx.imageSmoothingEnabled = originalSmoothing;
}
