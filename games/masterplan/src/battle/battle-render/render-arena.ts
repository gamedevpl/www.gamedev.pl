import { BattleState } from '../battle-state/battle-state-types';
import { toIsometric } from './render-utils';
import { UNIT_RADIUS } from '../battle-state/battle-state-consts';

// Define tile colors
const TILE_COLOR_1 = '#8B4513'; // SaddleBrown
const TILE_COLOR_2 = '#A0522D'; // Sienna

const TILE_SIZE = UNIT_RADIUS * 10;

export function renderArena(ctx: CanvasRenderingContext2D, battleState: BattleState) {
  const { width: ARENA_WIDTH, height: ARENA_HEIGHT } = battleState.arena;

  // Iterate through the grid
  for (let y = 0; y < ARENA_HEIGHT / TILE_SIZE; y++) {
    for (let x = 0; x < ARENA_WIDTH / TILE_SIZE; x++) {
      // Calculate tile corners using isometric transformation
      const topLeft = toIsometric(x, y);
      const topRight = toIsometric(x + 1, y);
      const bottomRight = toIsometric(x + 1, y + 1);
      const bottomLeft = toIsometric(x, y + 1);

      // Set fill color (alternating pattern)
      ctx.fillStyle = (x + y) % 2 === 0 ? TILE_COLOR_1 : TILE_COLOR_2;

      // Draw isometric tile
      ctx.beginPath();
      ctx.moveTo(topLeft.isoX * TILE_SIZE, topLeft.isoY * TILE_SIZE);
      ctx.lineTo(topRight.isoX * TILE_SIZE, topRight.isoY * TILE_SIZE);
      ctx.lineTo(bottomRight.isoX * TILE_SIZE, bottomRight.isoY * TILE_SIZE);
      ctx.lineTo(bottomLeft.isoX * TILE_SIZE, bottomLeft.isoY * TILE_SIZE);
      ctx.closePath();
      ctx.fill();

      // Draw tile border
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
      ctx.stroke();
    }
  }

  // Additional transformations or rendering logic can be added here
  // Ensure compatibility with the global transformation applied in renderBattle
}
