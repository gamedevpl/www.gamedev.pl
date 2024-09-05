import * as PIXI from 'pixi.js';
import { useEffect, useState } from 'react';

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
      })
      .then(() => {
        setApp(pixiApp);
        setLoading(false);
      });
  }, []);

  return { app, loading, error };
};
