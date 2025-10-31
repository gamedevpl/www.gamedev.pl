import React, { createContext, useContext, ReactNode, useCallback, useRef } from 'react';
import { Vector2D } from '../game/types/math-types';
import { BiomeType, RoadPiece } from '../game/types/world-types';
import { Vector3D, WebGPUTerrainState } from '../game/types/rendering-types';
import {
  initWebGPUTerrain,
  renderWebGPUTerrain,
  updateTerrainHeightMap as updateGpuHeightMap,
  updateBiomeMap as updateGpuBiomeMap,
  updateRoadMap as updateGpuRoadMap,
} from '../game/renderer/webgpu-renderer';
import { HEIGHT_SCALE } from '../game/constants/rendering-constants';

interface WebGpuRendererContextType {
  initTerrain: (
    canvas: HTMLCanvasElement,
    heightMap: number[][],
    biomeMap: BiomeType[][],
    roadMap: (RoadPiece | null)[][],
    mapDimensions: { width: number; height: number },
    cellSize: number,
    lighting?: { lightDir?: Vector3D; heightScale?: number; ambient?: number; displacementFactor?: number },
  ) => Promise<void>;
  renderTerrain: (center: Vector2D, zoom: number, time: number, lightDir?: Vector3D) => void;
  getParams: () => { heightScale: number; displacementFactor: number };
  updateTerrainHeightMap: (modifiedGridCells: Map<number, number>) => void;
  updateBiomeMap: (modifiedGridCells: Map<number, number>) => void;
  updateRoadMap: (modifiedGridCells: Map<number, RoadPiece | null>) => void;
}

const WebGpuRendererContext = createContext<WebGpuRendererContextType | undefined>(undefined);

export const WebGpuRendererProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const webGpuStateRef = useRef<WebGPUTerrainState | null>(null);

  const initTerrain = useCallback(
    async (
      canvas: HTMLCanvasElement,
      heightMap: number[][],
      biomeMap: BiomeType[][],
      roadMap: (RoadPiece | null)[][],
      mapDimensions: { width: number; height: number },
      cellSize: number,
      lighting?: { lightDir?: Vector3D; heightScale?: number; ambient?: number; displacementFactor?: number },
    ) => {
      const gpuState = await initWebGPUTerrain(
        canvas,
        heightMap,
        biomeMap,
        roadMap,
        mapDimensions,
        cellSize,
        lighting,
      );
      webGpuStateRef.current = gpuState;
    },
    [],
  );

  const renderTerrain = useCallback((center: Vector2D, zoom: number, time: number, lightDir?: Vector3D) => {
    if (webGpuStateRef.current) {
      renderWebGPUTerrain(webGpuStateRef.current, center, zoom, time, lightDir);
    }
  }, []);

  const updateTerrainHeightMap = useCallback((modifiedGridCells: Map<number, number>) => {
    if (webGpuStateRef.current) {
      updateGpuHeightMap(webGpuStateRef.current, modifiedGridCells);
    }
  }, []);

  const updateBiomeMap = useCallback((modifiedGridCells: Map<number, number>) => {
    if (webGpuStateRef.current) {
      updateGpuBiomeMap(webGpuStateRef.current, modifiedGridCells);
    }
  }, []);

  const updateRoadMap = useCallback((modifiedGridCells: Map<number, RoadPiece | null>) => {
    if (webGpuStateRef.current) {
      updateGpuRoadMap(webGpuStateRef.current, modifiedGridCells);
    }
  }, []);

  const getParams = useCallback(() => {
    if (webGpuStateRef.current) {
      return {
        heightScale: webGpuStateRef.current.heightScale,
        displacementFactor: 0, // Deprecated after moving to 3D mesh
      };
    }
    return {
      heightScale: HEIGHT_SCALE,
      displacementFactor: 0, // Deprecated
    };
  }, []);

  const value = {
    initTerrain,
    renderTerrain,
    getParams,
    updateTerrainHeightMap,
    updateBiomeMap,
    updateRoadMap,
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
