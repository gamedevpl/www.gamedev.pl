/**
 * 3D vector type for light direction and other 3D calculations.
 */
export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

/**
 * WebGPU renderer state for terrain rendering.
 */
export interface WebGPUTerrainState {
  canvas: HTMLCanvasElement;
  device: GPUDevice;
  context: GPUCanvasContext;
  format: GPUTextureFormat;
  pipeline: GPURenderPipeline;
  uniformBuffer: GPUBuffer;
  bindGroup: GPUBindGroup;
  sampler: GPUSampler;
  heightTexture: GPUTexture;
  heightTextureView: GPUTextureView;
  gridSize: { width: number; height: number };
  mapDimensions: { width: number; height: number };
  cellSize: number; // world units per height texel (HEIGHT_MAP_RESOLUTION)
  // Lighting parameters
  lightDir: Vector3D;
  heightScale: number;
  displacementFactor: number;
  ambient: number;
  // Water parameters
  waterLevel: number;
  time: number; // For water animation
}
