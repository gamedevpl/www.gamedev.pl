import React, { useRef, useState } from 'react';
import { initWorld } from '../game/game-factory';
import { GameWorldState } from '../game/types/game-types';
import { Vector2D } from '../game/types/math-types';
import { GameRenderer } from './game-renderer';
import { GameWorldController } from './game-world-controller';

export const GameScreen: React.FC = () => {
  const [initialState] = useState(() => initWorld());

  const webgpuCanvasRef = useRef<HTMLCanvasElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const gameStateRef = useRef<GameWorldState>(initialState);
  const viewportCenterRef = useRef<Vector2D>(initialState.viewportCenter);
  const viewportZoomRef = useRef<number>(initialState.viewportZoom);

  return (
    <>
      <GameRenderer
        webgpuCanvasRef={webgpuCanvasRef}
        canvasRef={canvasRef}
        ctxRef={ctxRef}
        gameStateRef={gameStateRef}
        viewportCenterRef={viewportCenterRef}
        viewportZoomRef={viewportZoomRef}
      />
      <GameWorldController
        gameStateRef={gameStateRef}
        ctxRef={ctxRef}
        viewportCenterRef={viewportCenterRef}
        viewportZoomRef={viewportZoomRef}
        canvasRef={canvasRef}
      />
    </>
  );
};
