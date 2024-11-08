import { RefObject, useRef } from 'react';
import { useRafLoop } from 'react-use';
import { GameWorldState } from './game-world/game-world-types';
import { renderGame } from './game-render/game-renderer';

interface GameViewportProps {
  gameStateRef: RefObject<GameWorldState>;
}

export function GameViewport({ gameStateRef }: GameViewportProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useRafLoop(() => {
    if (!gameStateRef.current) {
      return;
    }

    renderGame(gameStateRef.current, canvasRef.current!.getContext('2d')!);
  });

  return <canvas ref={canvasRef} />;
}
