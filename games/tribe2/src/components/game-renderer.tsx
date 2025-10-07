import React, { useEffect } from 'react';
import { renderGame } from '../game/renderer/renderer';
import { GameWorldState } from '../game/types/game-types';
import { Vector2D } from '../game/types/math-types';
import { BACKGROUND_COLOR } from '../game/game-consts';

interface GameRendererProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  ctxRef: React.MutableRefObject<CanvasRenderingContext2D | null>;
  gameStateRef: React.RefObject<GameWorldState>;
  viewportCenterRef: React.MutableRefObject<Vector2D>;
}

export const GameRenderer: React.FC<GameRendererProps> = ({
  canvasRef,
  ctxRef,
  gameStateRef,
  viewportCenterRef,
}) => {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    ctxRef.current = canvas.getContext('2d');

    const handleResize = () => {
      if (canvas && ctxRef.current && gameStateRef.current) {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        renderGame(
          ctxRef.current,
          gameStateRef.current,
          viewportCenterRef.current,
          { width: canvas.width, height: canvas.height },
        );
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []); // Empty dependency array ensures this runs only once on mount

  return <canvas ref={canvasRef} style={{ display: 'block', background: BACKGROUND_COLOR }} />;
};
