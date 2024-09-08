import * as PIXI from 'pixi.js';
import { useEffect, useState } from 'react';
import { SCREEN_HEIGHT, SCREEN_WIDTH } from './renderer';

export const usePixiApp = (canvasRef: React.RefObject<HTMLCanvasElement>) => {
  const [app, setApp] = useState<PIXI.Application | null>(null);
  const [loading, setLoading] = useState(true);
  const [error] = useState<Error | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    const pixiApp = new PIXI.Application();

    pixiApp
      .init({
        view: canvasRef.current,
        resizeTo: canvasRef.current,
        backgroundColor: 0x000000,
        width: SCREEN_WIDTH,
        height: SCREEN_HEIGHT,
      })
      .then(() => {
        setApp(pixiApp);
        setLoading(false);
      });
  }, []);

  return { app, loading, error };
};
