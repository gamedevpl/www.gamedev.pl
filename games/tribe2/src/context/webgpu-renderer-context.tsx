import React, { createContext, useContext, ReactNode, useCallback, useRef } from 'react';
import { Vector2D } from '../game/types/math-types';
import { BiomeType } from '../game/types/world-types';
import { Vector3D, WebGPUTerrainState } from '../game/types/rendering-types';
import { initWebGPUTerrain, renderWebGPUTerrain } from '../game/renderer/webgpu-renderer';
import { HEIGHT_SCALE, TERRAIN_DISPLACEMENT_FACTOR } from '../game/constants/rendering-constants';

interface WebGpuRendererContextType {
  initTerrain: (
    canvas: HTMLCanvasElement,
    heightMap: number[][],
    biomeMap: BiomeType[][],
    mapDimensions: { width: number; height: number },
    cellSize: number,
    lighting?: { lightDir?: Vector3D; heightScale?: number; ambient?: number; displacementFactor?: number },
  ) => Promise<void>;
  renderTerrain: (center: Vector2D, zoom: number, time: number, lightDir?: Vector3D) => void;
  getParams: () => { heightScale: number; displacementFactor: number };
}

const WebGpuRendererContext = createContext<WebGpuRendererContextType | undefined>(undefined);

export const WebGpuRendererProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const webGpuStateRef = useRef<WebGPUTerrainState | null>(null);

  const initTerrain = useCallback(
    async (
      canvas: HTMLCanvasElement,
      heightMap: number[][],
      biomeMap: BiomeType[][],
      mapDimensions: { width: number; height: number },
      cellSize: number,
      lighting?: { lightDir?: Vector3D; heightScale?: number; ambient?: number; displacementFactor?: number },
    ) => {
      const gpuState = await initWebGPUTerrain(canvas, heightMap, biomeMap, mapDimensions, cellSize, lighting);
      webGpuStateRef.current = gpuState;
    },
    [],
  );

  const renderTerrain = useCallback((center: Vector2D, zoom: number, time: number, lightDir?: Vector3D) => {
    if (webGpuStateRef.current) {
      renderWebGPUTerrain(webGpuStateRef.current, center, zoom, time, lightDir);
    }
  }, []);

  const getParams = useCallback(() => {
    if (webGpuStateRef.current) {
      return {
        heightScale: webGpuStateRef.current.heightScale,
        displacementFactor: webGpuStateRef.current.displacementFactor,
      };
    }
    return {
      heightScale: HEIGHT_SCALE,
      displacementFactor: TERRAIN_DISPLACEMENT_FACTOR,
    };
  }, []);

  const value = {
    initTerrain,
    renderTerrain,
    getParams,
  };

  return <WebGpuRendererContext.Provider value={value}>{children}</WebGpuRendererContext.Provider>;
};

export const useWebGpuRenderer = () => {
  const context = useContext(WebGpuRendererContext);
  if (context === undefined) {
    throw new Error('useWebGpuRenderer must be used within a WebGpuRendererProvider');
  }
  return context;
};
