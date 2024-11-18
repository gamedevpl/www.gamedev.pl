import { RenderState } from './render-state';
import { GRID_CELL_SIZE, GRID_HEIGHT, GRID_WIDTH } from './fire-render-state';

/**
 * Render a single fire cell with temperature-based color
 */
function renderFireCell(ctx: CanvasRenderingContext2D, x: number, y: number, temperature: number) {
  if (temperature <= 0) return;

  // Calculate color intensity based on temperature
  const intensity = temperature;
  ctx.fillStyle = `rgba(255, ${Math.floor(200 * intensity)}, 0, ${intensity})`;
  ctx.fillRect(x * GRID_CELL_SIZE, y * GRID_CELL_SIZE, GRID_CELL_SIZE, GRID_CELL_SIZE);
}

/**
 * Render the entire fire grid efficiently
 */
function renderFireGrid(ctx: CanvasRenderingContext2D, grid: RenderState['fire']['grid']) {
  // Batch similar temperature cells together for better performance
  for (let y = 0; y < GRID_HEIGHT; y++) {
    for (let x = 0; x < GRID_WIDTH; x++) {
      const cell = grid[y][x];
      renderFireCell(ctx, x, y, cell.temperature);
    }
  }
}

/**
 * Main rendering function for fireballs and fire effects
 */
export function renderFireballs(ctx: CanvasRenderingContext2D, render: RenderState): void {
  // Save the current context state
  ctx.save();

  // Set composite operation for better blending
  ctx.globalCompositeOperation = 'screen';

  // First render the fire grid
  renderFireGrid(ctx, render.fire.grid);

  // Restore the context state
  ctx.restore();
}
