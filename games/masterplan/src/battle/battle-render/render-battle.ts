import { BattleState } from '../battle-state/battle-state-types';
import { renderArena } from './render-arena';
import { renderUnits } from './render-units';
import { renderEffects } from './render-effects';
import { toIsometric, isPositionVisible } from './render-utils';

const UNIT_SIZE = 32; // Assuming a square unit size of 32x32 pixels

export function renderBattle(ctx: CanvasRenderingContext2D, battleState: BattleState) {
  // Clear the canvas
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  // Calculate the bounding rectangle for the content to be rendered
  const boundingRect = calculateBoundingRect(battleState);

  // Get the dimensions of the bounding rectangle
  const contentWidth = boundingRect.maxX - boundingRect.minX;
  const contentHeight = boundingRect.maxY - boundingRect.minY;

  // Get the size of the canvas
  const canvasWidth = ctx.canvas.width;
  const canvasHeight = ctx.canvas.height;

  // Determine scale to fit the entire content within the canvas
  const scaleX = canvasWidth / contentWidth;
  const scaleY = canvasHeight / contentHeight;
  const scale = Math.min(scaleX, scaleY);

  // Calculate translation to center the content
  const translateX = (canvasWidth - contentWidth * scale) / 2 - boundingRect.minX * scale;
  const translateY = (canvasHeight - contentHeight * scale) / 2 - boundingRect.minY * scale;

  // Apply global transformation
  ctx.save();
  ctx.translate(translateX, translateY);
  ctx.scale(scale, scale);

  // Render the arena (background)
  renderArena(ctx, battleState);

  // Render units (with culling)
  renderUnits(ctx, {
    ...battleState,
    units: battleState.units.filter(unit => isPositionVisible(unit.position, ctx.canvas))
  });

  // Render effects (with culling)
  renderEffects(ctx, {
    ...battleState,
    effects: battleState.effects.filter(effect => isPositionVisible(effect.position, ctx.canvas))
  });

  // Restore the context state
  ctx.restore();
}

function calculateBoundingRect(battleState: BattleState) {
  const { width, height } = battleState.arena;

  // Initialize with the arena corners
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  // Function to update bounds
  const updateBounds = (x: number, y: number) => {
    const { isoX, isoY } = toIsometric(x, y);
    minX = Math.min(minX, isoX);
    minY = Math.min(minY, isoY);
    maxX = Math.max(maxX, isoX);
    maxY = Math.max(maxY, isoY);
  };

  // Check arena corners
  updateBounds(0, 0);
  updateBounds(width, 0);
  updateBounds(0, height);
  updateBounds(width, height);

  // Check unit positions
  battleState.units.forEach(unit => {
    updateBounds(unit.position.x - UNIT_SIZE / 2, unit.position.y - UNIT_SIZE / 2);
    updateBounds(unit.position.x + UNIT_SIZE / 2, unit.position.y + UNIT_SIZE / 2);
  });

  // Add some padding
  const padding = UNIT_SIZE * 2;
  return {
    minX: minX - padding,
    minY: minY - padding,
    maxX: maxX + padding,
    maxY: maxY + padding
  };
}