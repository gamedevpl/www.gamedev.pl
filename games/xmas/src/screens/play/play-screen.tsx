import { useRef } from 'react';
import { GameViewport } from './game-viewport';
import { GameWorldState } from './game-world/game-world-types';
import { useRafLoop } from 'react-use';
import { updateGameWorld } from './game-world/game-world-update';
import { createRenderState, RenderState, updateRenderState } from './game-render/render-state';

const INITIAL_STATE: GameWorldState = {
  time: 0,
  santas: [],
  gifts: [],
  chimneys: [],
  fireballs: [],
};

const UPDATE_STEP = 1000 / 60; // 60 FPS

const MAX_DELTA_TIME = 1;

export function PlayScreen() {
  const gameStateRef = useRef<{
    gameWorldState: GameWorldState;
    renderState: RenderState;
  }>({
    gameWorldState: INITIAL_STATE,
    renderState: createRenderState(),
  });

  useRafLoop(() => {
    let deltaTime = Date.now() - gameStateRef.current.gameWorldState.time;

    if (deltaTime > MAX_DELTA_TIME) {
      gameStateRef.current.gameWorldState.time = Date.now() - MAX_DELTA_TIME;
      deltaTime = MAX_DELTA_TIME;
    }

    while (deltaTime >= 0) {
      // Update game world
      gameStateRef.current.gameWorldState = updateGameWorld(gameStateRef.current.gameWorldState, UPDATE_STEP);

      // Update render state
      gameStateRef.current.renderState = updateRenderState(
        gameStateRef.current.gameWorldState,
        gameStateRef.current.renderState,
        UPDATE_STEP,
      );

      deltaTime -= UPDATE_STEP;
    }
  });

  return <GameViewport gameStateRef={gameStateRef} />;
}
