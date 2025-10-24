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
  mapDimensions: { width: number; height: number },
): { vertexData: Float32Array; vertexCount: number; biomeValueGrid: Float32Array } {
  const gridH = heightMap.length;
  const gridW = heightMap[0]?.length ?? 0;
  const biomeValueGrid = new Float32Array(gridW * gridH);

  // 7 floats per vertex: 3 for position (x,y,z), 3 for normal (nx,ny,nz), 1 for biome
  const floatsPerVertex = 7;
  const vertexData = new Float32Array((gridW - 1) * (gridH - 1) * 6 * floatsPerVertex);
  let vertexCount = 0;
  let offset = 0;

  const getHeight = (x: number, y: number) => {
    const clampedX = Math.max(0, Math.min(gridW - 1, x));
    const clampedY = Math.max(0, Math.min(gridH - 1, y));
    return heightMap[clampedY]?.[clampedX] ?? 0;
  };

  for (let y = 0; y < gridH; y++) {
    for (let x = 0; x < gridW; x++) {
      biomeValueGrid[y * gridW + x] = getBiomeValue(biomeMap[y][x]) / 4.0;
    }
  }

  for (let y = 0; y < gridH - 1; y++) {
    for (let x = 0; x < gridW - 1; x++) {
      // Define 4 corner vertices of a quad
      const corners = [
        { x: x, y: y },
        { x: x + 1, y: y },
        { x: x, y: y + 1 },
        { x: x + 1, y: y + 1 },
      ];

      const vertices = corners.map((c) => {
        // Position - scale to exact map dimensions
        const h = getHeight(c.x, c.y);
        const scaledGridX = c.x / (gridW - 1);
        const scaledGridY = c.y / (gridH - 1);
        const px = scaledGridX * mapDimensions.width;
        const py = scaledGridY * mapDimensions.height;
        const pz = h * heightScale;

        // Normal (using central differences with effective cell sizes)
        const hx1 = getHeight(c.x + 1, c.y);
        const hx0 = getHeight(c.x - 1, c.y);
        const hy1 = getHeight(c.x, c.y + 1);
        const hy0 = getHeight(c.x, c.y - 1);
        const effectiveCellSizeX = mapDimensions.width / (gridW - 1);
        const effectiveCellSizeY = mapDimensions.height / (gridH - 1);
        const dzdx = ((hx1 - hx0) * heightScale) / (2.0 * effectiveCellSizeX);
        const dzdy = ((hy1 - hy0) * heightScale) / (2.0 * effectiveCellSizeY);
        const n = { x: -dzdx, y: -dzdy, z: 1.0 };
        const len = Math.hypot(n.x, n.y, n.z);
        const nx = n.x / len;
        const ny = n.y / len;
        const nz = n.z / len;

        // Biome
        const biomeValue = biomeValueGrid[c.y * gridW + c.x];

        return [px, py, pz, nx, ny, nz, biomeValue];
      });

      // Triangle 1: (0,0) -> (1,0) -> (0,1)
      const v00 = vertices[0];
      const v10 = vertices[1];
      const v01 = vertices[2];
      // Triangle 2: (1,0) -> (1,1) -> (0,1)
      const v11 = vertices[3];

      // Add triangle 1 to vertex data
      vertexData.set(v00, offset);
      offset += floatsPerVertex;
      vertexData.set(v10, offset);
      offset += floatsPerVertex;
      vertexData.set(v01, offset);
      offset += floatsPerVertex;

      // Add triangle 2 to vertex data
      vertexData.set(v10, offset);
      offset += floatsPerVertex;
      vertexData.set(v11, offset);
      offset += floatsPerVertex;
      vertexData.set(v01, offset);
      offset += floatsPerVertex;

      vertexCount += 6;
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

  const uniformBufferSize = 8 * 4 * 4; // 8 vec4s
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

export function renderWebGPUTerrain(state: WebGPUTerrainState, center: Vector2D, zoom: number, time: number, lightDir?: Vector3D) {
  const { device, context, pipeline, uniformBuffer, mapDimensions, canvas, waterLevel } = state;

  const currentLightDir = lightDir ?? state.lightDir;
  const encoder = device.createCommandEncoder();
  const textureView = context.getCurrentTexture().createView();

  const u = new Float32Array(32);
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
  state.device.queue.writeBuffer(state.vertexBuffer, 0, vertexData.buffer, vertexData.byteOffset, vertexData.byteLength);
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
