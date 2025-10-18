import React, { useRef, useState } from 'react';
import { initWorld } from '../game/game-factory';
import { GameWorldState } from '../game/types/game-types';
import { Vector2D } from '../game/types/math-types';
import { GameRenderer } from './game-renderer';
import { GameWorldController } from './game-world-controller';

export const GameScreen: React.FC = () => {
  // Use useState with a function initializer to ensure initWorld is called only once.
  const [initialState] = useState(() => initWorld());

  // Refs are used to hold mutable game state that can be updated by the game loop
  // without causing React to re-render the entire component tree.
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const gameStateRef = useRef<GameWorldState>(initialState);
  const viewportCenterRef = useRef<Vector2D>(initialState.viewportCenter);
  const viewportZoomRef = useRef<number>(initialState.viewportZoom);

  return (
    <>
      {/* The GameRenderer component is responsible for the <canvas> element and drawing. */}
      <GameRenderer
        canvasRef={canvasRef}
        ctxRef={ctxRef}
        gameStateRef={gameStateRef}
        viewportCenterRef={viewportCenterRef}
        viewportZoomRef={viewportZoomRef}
      />
      {/* The GameWorldController component is responsible for the game loop and input. */}
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
