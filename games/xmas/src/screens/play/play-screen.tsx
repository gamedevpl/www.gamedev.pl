// Placeholder for the main game screen, where the game will be played.

import { useRef } from 'react';
import { GameViewport } from './game-viewport';
import { GameWorldState } from './game-world/game-world-types';
import { useRafLoop } from 'react-use';
import { updateGameWorld } from './game-world/game-world-update';

export function PlayScreen() {
  const gameStateRef = useRef<GameWorldState>({
    time: 0,
    santas: [],
    gifts: [],
    chimneys: [],
    fireballs: [],
  });

  useRafLoop(() => {
    gameStateRef.current = updateGameWorld(gameStateRef.current);
  });

  return <GameViewport gameStateRef={gameStateRef} />;
}
