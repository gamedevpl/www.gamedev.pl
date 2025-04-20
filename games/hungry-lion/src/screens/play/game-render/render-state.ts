import { GAME_WORLD_WIDTH, GAME_WORLD_HEIGHT } from '../game-world/game-world-consts';
import { GameWorldState } from '../game-world/game-world-types';
import { getLions } from '../game-world/game-world-query';

export type ViewportState = {
  x: number;
  y: number;
};

export type RenderState = {
  viewport: ViewportState;
};

const calculateViewportTranslation = (
  worldState: GameWorldState,
  canvasWidth: number,
  canvasHeight: number,
): ViewportState => {
  // Calculate the center position where we want the lion to be on screen
  const targetX = canvasWidth / 2;
  const targetY = canvasHeight / 2;

  const [lion] = getLions(worldState);

  // If no lion, default to center of the world (or 0,0)
  if (!lion) {
    return {
      x: targetX - GAME_WORLD_WIDTH / 2,
      y: targetY - GAME_WORLD_HEIGHT / 2,
    };
  }

  // Calculate the translation needed to center the player
  // The viewport position represents the top-left corner of the visible world area
  // in the canvas coordinate system. If viewport.x is 0, the world's left edge (x=0)
  // is at the canvas's left edge. If viewport.x is -100, the world coordinate x=100
  // is at the canvas's left edge.
  // We want lion.position.x + viewport.x = targetX
  // So, viewport.x = targetX - lion.position.x
  const translateX = targetX - lion.position.x;
  const translateY = targetY - lion.position.y;

  // --- Constraints Removed for World Wrapping ---
  // Constrain translation to prevent showing beyond world boundaries (OLD LOGIC)
  // Left boundary
  // translateX = Math.min(0, translateX);
  // Right boundary
  // translateX = Math.max(-GAME_WORLD_WIDTH + canvasWidth, translateX);
  // Top boundary
  // translateY = Math.min(0, translateY);
  // Bottom boundary
  // translateY = Math.max(-GAME_WORLD_HEIGHT + canvasHeight, translateY);
  // --- End Constraints Removed ---

  return {
    x: translateX,
    y: translateY,
  };
};

export const createRenderState = (): RenderState => ({
  viewport: { x: 0, y: 0 },
});

export const updateRenderState = (
  world: GameWorldState,
  _state: RenderState, // Previous state is not used here, but kept for potential future use
  _deltaTime: number,
  canvasWidth: number = window.innerWidth,
  canvasHeight: number = window.innerHeight,
): RenderState => ({
  viewport: calculateViewportTranslation(world, canvasWidth, canvasHeight),
});
