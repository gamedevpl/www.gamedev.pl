import React, { useRef, useEffect } from 'react';
import { useRafLoop } from 'react-use';
import { renderGame } from '../game/render';
import { initGame } from '../game';
import { updateWorld } from '../game/world-update';
import { GameWorldState } from '../game/world-types';

const INITIAL_STATE = initGame();

export const GameScreen: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const gameStateRef = useRef<GameWorldState>(INITIAL_STATE);
  const lastUpdateTimeRef = useRef<number>();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    ctxRef.current = canvas.getContext('2d');

    const handleResize = () => {
      if (canvas) {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        if (ctxRef.current) {
          renderGame(ctxRef.current, gameStateRef.current);
        }
      }
    };

    handleResize(); // Initial size set

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []); // Empty dependency array ensures this runs once on mount and unmount

  const [stopLoop, startLoop] = useRafLoop((time) => {
    if (ctxRef.current && lastUpdateTimeRef.current) {
      const deltaTime = (time - lastUpdateTimeRef.current) / 1000; // Convert to seconds
      gameStateRef.current = updateWorld(gameStateRef.current, deltaTime); // Convert seconds to hours
      renderGame(ctxRef.current, gameStateRef.current);
    }
    lastUpdateTimeRef.current = time;
  }, false); // Initially false, so it doesn't start automatically

  useEffect(() => {
    startLoop();
    return () => {
      stopLoop();
    };
  }, [startLoop, stopLoop]);

  return <canvas ref={canvasRef} style={{ display: 'block' }} />;
};
