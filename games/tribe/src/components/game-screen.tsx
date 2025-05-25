import React, { useRef, useEffect } from 'react';
import { useRafLoop } from 'react-use';
import { renderGame } from '../game/render';

export const GameScreen: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    ctxRef.current = canvas.getContext('2d');

    const handleResize = () => {
      if (canvas) {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        if (ctxRef.current) {
          renderGame(ctxRef.current);
        }
      }
    };

    handleResize(); // Initial size set

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []); // Empty dependency array ensures this runs once on mount and unmount

  const [stopLoop, startLoop] = useRafLoop(() => {
    if (ctxRef.current) {
      renderGame(ctxRef.current);
    }
  }, false); // Initially false, so it doesn't start automatically

  useEffect(() => {
    startLoop();
    return () => {
      stopLoop();
    };
  }, [startLoop, stopLoop]);

  return <canvas ref={canvasRef} style={{ display: 'block' }} />;
};
