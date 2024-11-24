import { GameWorldState } from '../game-world/game-world-types';
import { FireRenderState, createFireRenderState, updateFireRenderState } from './fire-render-state';
import { SnowRenderState, createSnowRenderState, updateSnowRenderState } from './snow-render-state';
import { LandscapeState, createLandscapeState, updateLandscapeState } from './landscape-render-state';

export type RenderState = {
  fire: FireRenderState;
  snow: SnowRenderState;
  landscape: LandscapeState;
};

/**
 * Create a new render state with initial values
 */
export function createRenderState(): RenderState {
  return {
    fire: createFireRenderState(),
    snow: createSnowRenderState(),
    landscape: createLandscapeState(),
  };
}

/**
 * Update the render state based on the current game world state
 */
export function updateRenderState(world: GameWorldState, state: RenderState, deltaTime: number): RenderState {
  return {
    fire: updateFireRenderState(world, state.fire, deltaTime),
    snow: updateSnowRenderState(world, state.snow, deltaTime),
    landscape: updateLandscapeState(world, state.landscape, deltaTime),
  };
}