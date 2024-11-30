import { GameWorldState } from '../game-world/game-world-types';
import { FireRenderState, createFireRenderState, updateFireRenderState } from './fire-render-state';
import { SnowRenderState, createSnowRenderState, updateSnowRenderState } from './snow-render-state';
import { 
  LandscapeState, 
  createLandscapeState, 
  updateLandscapeState 
} from './landscape/landscape-state';
import { GAME_WORLD_WIDTH, GAME_WORLD_HEIGHT } from '../game-world/game-world-consts';

export type ViewportState = {
  x: number;
  y: number;
};

export type RenderState = {
  fire: FireRenderState;
  snow: SnowRenderState;
  landscape: LandscapeState;
  viewport: ViewportState;
};

const calculateViewportTranslation = (
  worldState: GameWorldState,
  canvasWidth: number,
  canvasHeight: number
): ViewportState => {
  const { playerSanta } = worldState;
  
  // Calculate the center position where we want the santa to be
  const targetX = canvasWidth / 2;
  const targetY = canvasHeight / 2;
  
  // Calculate the translation needed to center the santa
  let translateX = targetX - playerSanta.x;
  let translateY = targetY - playerSanta.y;
  
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
    y: translateY
  };
};

export const createRenderState = (): RenderState => ({
  fire: createFireRenderState(),
  snow: createSnowRenderState(),
  landscape: createLandscapeState(),
  viewport: { x: 0, y: 0 }
});

export const updateRenderState = (
  world: GameWorldState, 
  state: RenderState, 
  deltaTime: number,
  canvasWidth: number = window.innerWidth,
  canvasHeight: number = window.innerHeight
): RenderState => ({
  fire: updateFireRenderState(world, state.fire, deltaTime),
  snow: updateSnowRenderState(world, state.snow, deltaTime),
  landscape: updateLandscapeState(world, state.landscape, deltaTime),
  viewport: calculateViewportTranslation(world, canvasWidth, canvasHeight)
});