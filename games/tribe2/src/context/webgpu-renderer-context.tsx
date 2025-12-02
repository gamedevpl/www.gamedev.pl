// WebGPU renderer removed - stub for compatibility
import React, { createContext, ReactNode } from 'react';

const WebGpuRendererContext = createContext<any>(null);

export const WebGpuRendererProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  return <WebGpuRendererContext.Provider value={null}>{children}</WebGpuRendererContext.Provider>;
};

export const useWebGpuRenderer = () => ({
  initTerrain: async (_canvas: any, _heightMap: any, _biomeMap: any, _roadMap: any, _mapDimensions: any, _resolution: any) => {},
  render: (_canvas: any, _viewportCenter: any, _zoom: any, _dimensions: any, _lightDir: any) => {},
  renderTerrain: () => {},
  updateTerrainHeightMap: () => {},
  updateBiomeMap: () => {},
  updateRoadMap: () => {},
});
