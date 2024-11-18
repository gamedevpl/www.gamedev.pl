import { useRef } from 'react';
import { GameViewport } from './game-viewport';
import { GameWorldState } from './game-world/game-world-types';
import { useRafLoop } from 'react-use';
import { updateGameWorld } from './game-world/game-world-update';
import { createRenderState, RenderState, updateRenderState } from './game-render/render-state';

const INITIAL_STATE = {
  gameWorldState: {
    time: 0,
    santas: [],
    gifts: [],
    chimneys: [],
    fireballs: [
      {
        id: '1',
        x: 300,
        y: 300,
        radius: 100,
      },
      {
        id: '2',
        x: 350,
        y: 350,
        radius: 100,
      },
      {
        id: '2',
        x: 300,
        y: 150,
        radius: 150,
      },
    ],
  },
  renderState: createRenderState(),
};

export function PlayScreen() {
  const gameStateRef = useRef<{ gameWorldState: GameWorldState; renderState: RenderState }>(INITIAL_STATE);

  useRafLoop(() => {
    const deltaTime = Date.now() - gameStateRef.current.gameWorldState.time;
    gameStateRef.current.gameWorldState = updateGameWorld(gameStateRef.current.gameWorldState, deltaTime);
    gameStateRef.current.renderState = updateRenderState(
      gameStateRef.current.gameWorldState,
      gameStateRef.current.renderState,
      deltaTime,
    );
  });

  return <GameViewport gameStateRef={gameStateRef} />;
}
