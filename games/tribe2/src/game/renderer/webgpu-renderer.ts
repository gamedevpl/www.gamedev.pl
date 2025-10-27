import terrainShaderWGSL from './shaders/terrain.wgsl?raw';
import { Vector2D } from '../../game/types/math-types';
import { WebGPUTerrainState, Vector3D } from '../types/rendering-types';
import { WATER_LEVEL } from '../constants/world-constants';
import {
  TERRAIN_DISPLACEMENT_FACTOR,
  GROUND_COLOR,
  SAND_COLOR,
  GRASS_COLOR,
  ROCK_COLOR,
  SNOW_COLOR,
  HEIGHT_SCALE,
} from '../constants/rendering-constants';
import { BiomeType } from '../types/world-types';

function isWebGPUSupported() {
  return typeof navigator !== 'undefined' && 'gpu' in navigator;
}

function getBiomeValue(biome: BiomeType): number {
  switch (biome) {
    case BiomeType.GROUND:
      return 0.0;
    case BiomeType.SAND:
      return 1.0;
    case BiomeType.GRASS:
      return 2.0;
    case BiomeType.ROCK:
      return 3.0;
    case BiomeType.SNOW:
      return 4.0;
    default:
      return 0.0;
  }
}

// Generates a non-indexed triangle list mesh for the terrain
function generateTerrainMesh(
  heightMap: number[][],
  biomeMap: BiomeType[][],
  cellSize: number,
  heightScale: number,
  _mapDimensions: { width: number; height: number },
): { vertexData: Float32Array; vertexCount: number; biomeValueGrid: Float32Array } {
  const gridH = heightMap.length;
  const gridW = heightMap[0]?.length ?? 0;

  // 7 floats per vertex: 3 for position (x,y,z), 3 for normal (nx,ny,nz), 1 for biome
  const floatsPerVertex = 7;
  const vertexData = new Float32Array(gridW * gridH * 6 * floatsPerVertex);
  let vertexCount = 0;
  let offset = 0;

  // Helper to get height with toroidal wrapping
  const getHeight = (x: number, y: number) => {
    const wrappedX = ((x % gridW) + gridW) % gridW;
    const wrappedY = ((y % gridH) + gridH) % gridH;
    return heightMap[wrappedY]?.[wrappedX] ?? 0;
  };

  // Helper to get biome with toroidal wrapping
  const getBiome = (x: number, y: number) => {
    const wrappedX = ((x % gridW) + gridW) % gridW;
    const wrappedY = ((y % gridH) + gridH) % gridH;
    return biomeMap[wrappedY]?.[wrappedX] ?? BiomeType.GROUND;
  };

  // Loop over every cell to create a quad, ensuring the mesh wraps around.
  for (let y = 0; y < gridH; y++) {
    for (let x = 0; x < gridW; x++) {
      // Define 4 corner vertices of a quad. The coordinates for sampling
      // can exceed gridW/gridH because our helpers handle wrapping.
      const corners = [
        { x: x, y: y }, // Top-left of quad
        { x: x + 1, y: y }, // Top-right
        { x: x, y: y + 1 }, // Bottom-left
        { x: x + 1, y: y + 1 }, // Bottom-right
      ];

      const vertices = corners.map((c) => {
        // 1. Position
        const h = getHeight(c.x, c.y);
        const px = c.x * cellSize;
        const py = c.y * cellSize;
        const pz = h * heightScale;

        // 2. Normal (using central differences)
        const hx1 = getHeight(c.x + 1, c.y);
        const hx0 = getHeight(c.x - 1, c.y);
        const hy1 = getHeight(c.x, c.y + 1);
        const hy0 = getHeight(c.x, c.y - 1);
        const dzdx = ((hx1 - hx0) * heightScale) / (2.0 * cellSize);
        const dzdy = ((hy1 - hy0) * heightScale) / (2.0 * cellSize);
        const n = { x: -dzdx, y: -dzdy, z: 1.0 };
        const len = Math.hypot(n.x, n.y, n.z);
        const nx = n.x / len;
        const ny = n.y / len;
        const nz = n.z / len;

        // 3. Biome
        const biomeType = getBiome(c.x, c.y);
        const biomeValue = getBiomeValue(biomeType) / 4.0;

        return [px, py, pz, nx, ny, nz, biomeValue];
      });

      const [v00, v10, v01, v11] = vertices;

      // Triangle 1: (0,0) -> (1,0) -> (0,1)
      vertexData.set(v00, offset);
      offset += floatsPerVertex;
      vertexData.set(v10, offset);
      offset += floatsPerVertex;
      vertexData.set(v01, offset);
      offset += floatsPerVertex;

      // Triangle 2: (1,0) -> (1,1) -> (0,1)
      vertexData.set(v10, offset);
      offset += floatsPerVertex;
      vertexData.set(v11, offset);
      offset += floatsPerVertex;
      vertexData.set(v01, offset);
      offset += floatsPerVertex;

      vertexCount += 6;
    }
  }

  // This is only needed for the editor, so we can compute it once here.
  const biomeValueGrid = new Float32Array(gridW * gridH);
  for (let y = 0; y < gridH; y++) {
    for (let x = 0; x < gridW; x++) {
      biomeValueGrid[y * gridW + x] = getBiomeValue(biomeMap[y][x]) / 4.0;
    }
  }

  return { vertexData, vertexCount, biomeValueGrid };
}

export async function initWebGPUTerrain(
  canvas: HTMLCanvasElement,
  heightMap: number[][],
  biomeMap: BiomeType[][],
  mapDimensions: { width: number; height: number },
  cellSize: number,
  lighting?: { lightDir?: Vector3D; heightScale?: number; ambient?: number; displacementFactor?: number },
): Promise<WebGPUTerrainState | null> {
  if (!isWebGPUSupported()) {
    console.warn('WebGPU not supported in this browser. Terrain will not render.');
    return null;
  }

  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) {
    console.warn('WebGPU adapter not available.');
    return null;
  }
  const device = await adapter.requestDevice();
  const context = canvas.getContext('webgpu') as GPUCanvasContext;
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: 'premultiplied' });

  const module = device.createShaderModule({ code: terrainShaderWGSL });
  const heightScale = lighting?.heightScale ?? HEIGHT_SCALE;

  const { vertexData, vertexCount, biomeValueGrid } = generateTerrainMesh(
    heightMap,
    biomeMap,
    cellSize,
    heightScale,
    mapDimensions,
  );

  const vertexBuffer = device.createBuffer({
    size: vertexData.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    mappedAtCreation: true,
  });
  new Float32Array(vertexBuffer.getMappedRange()).set(vertexData);
  vertexBuffer.unmap();

  const uniformBufferSize = 9 * 4 * 4; // 9 vec4s
  const uniformBuffer = device.createBuffer({
    size: uniformBufferSize,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const bindGroupLayout = device.createBindGroupLayout({
    entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }],
  });

  const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] });

  const pipeline = device.createRenderPipeline({
    layout: pipelineLayout,
    vertex: {
      module,
      entryPoint: 'vs_main',
      buffers: [
        {
          arrayStride: 7 * 4, // 7 floats * 4 bytes/float
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x3' }, // position
            { shaderLocation: 1, offset: 12, format: 'float32x3' }, // normal
            { shaderLocation: 2, offset: 24, format: 'float32' }, // biome
          ],
        },
      ],
    },
    fragment: { module, entryPoint: 'fs_main', targets: [{ format }] },
    primitive: { topology: 'triangle-list' },
  });

  const bindGroup = device.createBindGroup({
    layout: bindGroupLayout,
    entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
  });

  const state: WebGPUTerrainState = {
    canvas,
    device,
    context,
    format,
    pipeline,
    uniformBuffer,
    vertexBuffer,
    vertexCount,
    bindGroup,
    gridSize: { width: heightMap[0]?.length ?? 0, height: heightMap.length },
    mapDimensions,
    cellSize,
    lightDir: lighting?.lightDir ?? { x: 0.3, y: 0.5, z: 0.8 },
    heightScale,
    displacementFactor: lighting?.displacementFactor ?? TERRAIN_DISPLACEMENT_FACTOR,
    ambient: lighting?.ambient ?? 0.35,
    waterLevel: WATER_LEVEL,
    time: 0,
    heightMap,
    biomeMap,
    biomeValueGrid,
    heightData: new Uint8Array(),
    // Deprecated fields, kept for type compatibility
    sampler: device.createSampler(),
    heightTexture: device.createTexture({ size: [1, 1], format: 'r8unorm', usage: 0 }),
    heightTextureView: device.createTexture({ size: [1, 1], format: 'r8unorm', usage: 0 }).createView(),
    biomeTexture: device.createTexture({ size: [1, 1], format: 'r8unorm', usage: 0 }),
    biomeTextureView: device.createTexture({ size: [1, 1], format: 'r8unorm', usage: 0 }).createView(),
  };

  return state;
}

export function renderWebGPUTerrain(
  state: WebGPUTerrainState,
  center: Vector2D,
  zoom: number,
  time: number,
  lightDir?: Vector3D,
) {
  const { device, context, pipeline, uniformBuffer, mapDimensions, canvas, waterLevel } = state;

  const currentLightDir = lightDir ?? state.lightDir;
  const encoder = device.createCommandEncoder();
  const textureView = context.getCurrentTexture().createView();

  const u = new Float32Array(36);
  u[0] = center.x;
  u[1] = center.y;
  u[2] = zoom;
  u[4] = canvas.width;
  u[5] = canvas.height;
  u[6] = mapDimensions.width;
  u[7] = mapDimensions.height;
  const invLen = 1.0 / Math.hypot(currentLightDir.x, currentLightDir.y, currentLightDir.z);
  u[8] = currentLightDir.x * invLen;
  u[9] = currentLightDir.y * invLen;
  u[10] = currentLightDir.z * invLen;
  u[11] = state.heightScale;
  u[12] = state.ambient;
  u[13] = waterLevel;
  u[14] = time;
  u[16] = GROUND_COLOR.r;
  u[17] = GROUND_COLOR.g;
  u[18] = GROUND_COLOR.b;
  u[19] = SAND_COLOR.r;
  u[20] = SAND_COLOR.g;
  u[21] = SAND_COLOR.b;
  u[22] = GRASS_COLOR.r;
  u[23] = GRASS_COLOR.g;
  u[24] = GRASS_COLOR.b;
  u[25] = ROCK_COLOR.r;
  u[26] = ROCK_COLOR.g;
  u[27] = ROCK_COLOR.b;
  u[28] = SNOW_COLOR.r;
  u[29] = SNOW_COLOR.g;
  u[30] = SNOW_COLOR.b;
  u[32] = state.displacementFactor;
  device.queue.writeBuffer(uniformBuffer, 0, u.buffer);

  const pass = encoder.beginRenderPass({
    colorAttachments: [
      {
        view: textureView,
        clearValue: { r: 0.172, g: 0.322, b: 0.204, a: 1 },
        loadOp: 'clear',
        storeOp: 'store',
      },
    ],
  });
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, state.bindGroup);
  pass.setVertexBuffer(0, state.vertexBuffer);
  pass.draw(state.vertexCount, 9, 0, 0); // Draw 9 instances for the 3x3 wrapped world
  pass.end();

  device.queue.submit([encoder.finish()]);
}

function regenerateMeshAndUpdateBuffer(state: WebGPUTerrainState) {
  const { vertexData } = generateTerrainMesh(
    state.heightMap,
    state.biomeMap,
    state.cellSize,
    state.heightScale,
    state.mapDimensions,
  );
  state.device.queue.writeBuffer(
    state.vertexBuffer,
    0,
    vertexData.buffer,
    vertexData.byteOffset,
    vertexData.byteLength,
  );
}

export function updateTerrainHeightMap(state: WebGPUTerrainState, modifiedGridCells: Map<number, number>): void {
  if (modifiedGridCells.size === 0) return;
  const gridW = state.gridSize.width;
  modifiedGridCells.forEach((value, index) => {
    const x = index % gridW;
    const y = Math.floor(index / gridW);
    state.heightMap[y][x] = value / 255.0;
  });
  regenerateMeshAndUpdateBuffer(state);
}

export function updateBiomeMap(state: WebGPUTerrainState, modifiedGridCells: Map<number, number>): void {
  if (modifiedGridCells.size === 0) return;
  const gridW = state.gridSize.width;
  modifiedGridCells.forEach((value, index) => {
    const x = index % gridW;
    const y = Math.floor(index / gridW);
    const biomeId = Math.round((value / 255.0) * 4.0);
    let biomeType = BiomeType.GROUND;
    if (biomeId === 1) biomeType = BiomeType.SAND;
    else if (biomeId === 2) biomeType = BiomeType.GRASS;
    else if (biomeId === 3) biomeType = BiomeType.ROCK;
    else if (biomeId === 4) biomeType = BiomeType.SNOW;
    state.biomeMap[y][x] = biomeType;
  });
  regenerateMeshAndUpdateBuffer(state);
}
