import React, { useEffect } from 'react';
import { renderGame } from '../game/renderer/renderer';
import { GameWorldState } from '../game/types/game-types';
import { Vector2D } from '../game/types/math-types';
import { BACKGROUND_COLOR, HEIGHT_MAP_RESOLUTION } from '../game/game-consts';
import { initWebGPUTerrain } from '../game/renderer/webgpu-renderer';

interface GameRendererProps {
  webgpuCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  ctxRef: React.MutableRefObject<CanvasRenderingContext2D | null>;
  gameStateRef: React.RefObject<GameWorldState>;
  viewportCenterRef: React.MutableRefObject<Vector2D>;
  viewportZoomRef: React.MutableRefObject<number>;
}

export const GameRenderer: React.FC<GameRendererProps> = ({
  webgpuCanvasRef,
  canvasRef,
  ctxRef,
  gameStateRef,
  viewportCenterRef,
  viewportZoomRef,
}) => {
  useEffect(() => {
    const webgpuCanvas = webgpuCanvasRef.current;
    const canvas = canvasRef.current;
    if (!canvas || !webgpuCanvas) return;
    ctxRef.current = canvas.getContext('2d');
    if (!ctxRef.current) return;

    const handleResize = () => {
      if (!canvas || !webgpuCanvas) return;
      webgpuCanvas.width = window.innerWidth;
      webgpuCanvas.height = window.innerHeight;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;

      // Optionally trigger one render of entities after resize
      if (gameStateRef.current && ctxRef.current) {
        renderGame(
          ctxRef.current,
          gameStateRef.current,
          viewportCenterRef.current,
          viewportZoomRef.current,
          { width: canvas.width, height: canvas.height },
        );
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    // Initialize WebGPU terrain once
    (async () => {
      if (gameStateRef.current) {
        const state = await initWebGPUTerrain(
          webgpuCanvas,
          gameStateRef.current.heightMap,
          gameStateRef.current.mapDimensions,
          HEIGHT_MAP_RESOLUTION,
        );
        if (state) {
          gameStateRef.current.webgpu = state;
        }
      }
    })();

    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', background: BACKGROUND_COLOR }}>
      <canvas ref={webgpuCanvasRef} style={{ position: 'absolute', inset: 0, display: 'block' }} />
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, display: 'block', background: 'transparent' }} />
    </div>
  );
};
