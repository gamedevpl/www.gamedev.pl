import React, { useEffect } from 'react';
import { GameWorldState } from '../game/world-types';
import { renderGame } from '../game/render';
import { Vector2D } from '../game/utils/math-types';
import { PlayerActionHint } from '../game/ui/ui-types';
import { preloadSprites } from '../game/sprites/sprite-loader';

interface GameRenderProps {
  canvasRef: React.RefObject<HTMLCanvasElement>;
  ctxRef: React.MutableRefObject<CanvasRenderingContext2D | null>;
  gameStateRef: React.RefObject<GameWorldState>;
  isDebugOnRef: React.RefObject<boolean>;
  viewportCenterRef: React.MutableRefObject<Vector2D>;
  playerActionHintsRef: React.MutableRefObject<PlayerActionHint[]>;
}

export const GameRender: React.FC<GameRenderProps> = ({
  canvasRef,
  ctxRef,
  gameStateRef,
  isDebugOnRef,
  viewportCenterRef,
  playerActionHintsRef,
}) => {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    ctxRef.current = canvas.getContext('2d');

    // Preload sprites when component mounts
    preloadSprites().catch(error => {
      console.warn('Failed to preload some sprites, fallback rendering will be used:', error);
    });

    const handleResize = () => {
      if (canvas && ctxRef.current && gameStateRef.current) {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        renderGame(
          ctxRef.current,
          gameStateRef.current,
          isDebugOnRef.current === true,
          viewportCenterRef.current,
          playerActionHintsRef.current,
          false, // isIntro
        );
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []); // Empty dependency array ensures this runs only once on mount

  return <canvas ref={canvasRef} style={{ display: 'block', background: '#2c5234' }} />;
};
