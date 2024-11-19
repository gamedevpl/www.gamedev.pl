import { GameWorldState } from '../game-world/game-world-types';
import { FireRenderState, createFireRenderState, updateFireRenderState } from './fire-render-state';

export type RenderState = {
  fire: FireRenderState;
};

/**
 * Create a new render state with initial values
 */
export function createRenderState(): RenderState {
  return {
    fire: createFireRenderState(),
  };
}

/**
 * Update the render state based on the current game world state
 */
export function updateRenderState(world: GameWorldState, state: RenderState, deltaTime: number): RenderState {
  return {
    fire: updateFireRenderState(world, state.fire, deltaTime),
  };
}
