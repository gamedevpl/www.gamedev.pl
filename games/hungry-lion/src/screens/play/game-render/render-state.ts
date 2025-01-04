import { GAME_WORLD_WIDTH, GAME_WORLD_HEIGHT } from '../game-world/game-world-consts';
import { GameWorldState } from '../game-world/game-world-types';
import { getLions } from '../game-world/game-world-query';

export type ViewportState = {
  x: number;
  y: number;
};

export type HungerBarState = {
  isVisible: boolean;
  isWarningActive: boolean;
};

export type RenderState = {
  viewport: ViewportState;
  hungerBar: HungerBarState;
};

const calculateViewportTranslation = (
  worldState: GameWorldState,
  canvasWidth: number,
  canvasHeight: number,
): ViewportState => {
  // Calculate the center position where we want the santa to be
  const targetX = canvasWidth / 2;
  const targetY = canvasHeight / 2;

  const [lion] = getLions(worldState);

  // Calculate the translation needed to center the player
  let translateX = targetX - lion.position.x;
  let translateY = targetY - lion.position.y;

  // Constrain translation to prevent showing beyond world boundaries
  // Left boundary
  translateX = Math.min(0, translateX);
  // Right boundary
  translateX = Math.max(-GAME_WORLD_WIDTH + canvasWidth, translateX);

  // Top boundary
  translateY = Math.min(0, translateY);
  // Bottom boundary
  translateY = Math.max(-GAME_WORLD_HEIGHT + canvasHeight, translateY);

  return {
    x: translateX,
    y: translateY,
  };
};

export const createRenderState = (): RenderState => ({
  viewport: { x: 0, y: 0 },
  hungerBar: {
    isVisible: true,
    isWarningActive: false,
  },
});

export const updateRenderState = (
  world: GameWorldState,
  _state: RenderState,
  _deltaTime: number,
  canvasWidth: number = window.innerWidth,
  canvasHeight: number = window.innerHeight,
): RenderState => ({
  viewport: calculateViewportTranslation(world, canvasWidth, canvasHeight),
  hungerBar: {
    isVisible: true,
    isWarningActive: false, //world.lion.hunger.isStarving,
  },
});
