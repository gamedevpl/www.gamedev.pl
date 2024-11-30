import { GameWorldState } from '../game-world/game-world-types';
import { FireRenderState, createFireRenderState, updateFireRenderState } from './fire-render-state';
import { SnowRenderState, createSnowRenderState, updateSnowRenderState } from './snow-render-state';
import { 
  LandscapeState, 
  createLandscapeState, 
  updateLandscapeState 
} from './landscape/landscape-state';

export type RenderState = {
  fire: FireRenderState;
  snow: SnowRenderState;
  landscape: LandscapeState;
};

export const createRenderState = (): RenderState => ({
  fire: createFireRenderState(),
  snow: createSnowRenderState(),
  landscape: createLandscapeState(),
});

export const updateRenderState = (
  world: GameWorldState, 
  state: RenderState, 
  deltaTime: number
): RenderState => ({
  fire: updateFireRenderState(world, state.fire, deltaTime),
  snow: updateSnowRenderState(world, state.snow, deltaTime),
  landscape: updateLandscapeState(world, state.landscape, deltaTime),
});