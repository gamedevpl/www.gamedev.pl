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
} from '../constants/rendering-constants';
import { BiomeType } from '../types/world-types';

function isWebGPUSupported() {
  return typeof navigator !== 'undefined' && 'gpu' in navigator;
}

function flattenHeightMapToR8(heightMap: number[][]): { data: Uint8Array; width: number; height: number } {
  const h = heightMap.length;
  const w = heightMap[0]?.length ?? 0;
  const data = new Uint8Array(w * h);
  let i = 0;
  for (let y = 0; y < h; y++) {
    const row = heightMap[y];
    for (let x = 0; x < w; x++) {
      const v = Math.max(0, Math.min(1, row[x] ?? 0));
      data[i++] = Math.round(v * 255);
    }
  }
  return { data, width: w, height: h };
}

// Flattens the biome map to a Uint8Array where each biome ID [0-4] is
// normalized to the [0-255] range for use in an r8unorm texture.
function flattenBiomeMapToR8Unorm(biomeMap: BiomeType[][]): { data: Uint8Array; width: number; height: number } {
  const h = biomeMap.length;
  const w = biomeMap[0]?.length ?? 0;
  const data = new Uint8Array(w * h);
  let i = 0;
  for (let y = 0; y < h; y++) {
    const row = biomeMap[y];
    for (let x = 0; x < w; x++) {
      let biomeValue = 0; // Default to GROUND
      switch (row[x]) {
        case BiomeType.GROUND:
          biomeValue = 0;
          break;
        case BiomeType.SAND:
          biomeValue = 1;
          break;
        case BiomeType.GRASS:
          biomeValue = 2;
          break;
        case BiomeType.ROCK:
          biomeValue = 3;
          break;
        case BiomeType.SNOW:
          biomeValue = 4;
          break;
      }
      // Normalize the value from [0, 4] to [0, 255] for r8unorm texture.
      // The shader will receive this as a float in [0.0, 1.0].
      data[i++] = Math.round((biomeValue / 4.0) * 255);
    }
  }
  return { data, width: w, height: h };
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
  const context = canvas.getContext('webgpu') as unknown as GPUCanvasContext;
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: 'premultiplied' });

  const module = device.createShaderModule({ code: terrainShaderWGSL });

  const bindGroupLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
    ],
  });

  const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] });

  const pipeline = device.createRenderPipeline({
    layout: pipelineLayout,
    vertex: { module, entryPoint: 'vs_main' },
    fragment: { module, entryPoint: 'fs_main', targets: [{ format }] },
    primitive: { topology: 'triangle-list' },
  });

  // Uniform buffer (8 vec4 = 128 bytes)
  const uniformBufferSize = 8 * 4 * 4;
  const uniformBuffer = device.createBuffer({
    size: uniformBufferSize,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  // Height map texture
  const { data: heightData, width: gridW, height: gridH } = flattenHeightMapToR8(heightMap);
  const heightTexture = device.createTexture({
    size: { width: gridW, height: gridH },
    format: 'r8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  device.queue.writeTexture(
    { texture: heightTexture },
    heightData.buffer,
    { offset: heightData.byteOffset, bytesPerRow: gridW, rowsPerImage: gridH },
    { width: gridW, height: gridH },
  );
  const heightTextureView = heightTexture.createView();

  // Biome map texture
  const { data: biomeData } = flattenBiomeMapToR8Unorm(biomeMap);
  const biomeTexture = device.createTexture({
    size: { width: gridW, height: gridH },
    format: 'r8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  device.queue.writeTexture(
    { texture: biomeTexture },
    biomeData.buffer,
    { offset: biomeData.byteOffset, bytesPerRow: gridW, rowsPerImage: gridH },
    { width: gridW, height: gridH },
  );
  const biomeTextureView = biomeTexture.createView();

  const sampler = device.createSampler({
    addressModeU: 'repeat',
    addressModeV: 'repeat',
    magFilter: 'linear',
    minFilter: 'linear',
  });

  const bindGroup = device.createBindGroup({
    layout: bindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: heightTextureView },
      { binding: 2, resource: sampler },
      { binding: 3, resource: biomeTextureView },
    ],
  });

  const state: WebGPUTerrainState = {
    canvas,
    device,
    context,
    format,
    pipeline,
    uniformBuffer,
    bindGroup,
    sampler,
    heightTexture,
    heightTextureView,
    biomeTexture,
    biomeTextureView,
    gridSize: { width: gridW, height: gridH },
    mapDimensions,
    cellSize,
    lightDir: lighting?.lightDir ?? { x: 0.3, y: 0.5, z: 0.8 },
    heightScale: lighting?.heightScale ?? 120,
    displacementFactor: lighting?.displacementFactor ?? TERRAIN_DISPLACEMENT_FACTOR,
    ambient: lighting?.ambient ?? 0.35,
    waterLevel: WATER_LEVEL,
    time: 0,
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
  const {
    device,
    context,
    pipeline,
    uniformBuffer,
    mapDimensions,
    cellSize,
    ambient,
    canvas,
    waterLevel,
    displacementFactor,
  } = state;

  // Use provided lightDir or fall back to state's lightDir
  const currentLightDir = lightDir ?? state.lightDir;

  // Ensure the canvas is configured to current size
  const encoder = device.createCommandEncoder();
  const textureView = context.getCurrentTexture().createView();

  // Update uniforms
  const canvasWidth = canvas.width;
  const canvasHeight = canvas.height;

  const u = new Float32Array(32);
  // c0: center.x, center.y, zoom, cellSize
  u[0] = center.x;
  u[1] = center.y;
  u[2] = zoom;
  u[3] = cellSize;
  // c1: canvasSize.x, canvasSize.y, mapSize.x, mapSize.y
  u[4] = canvasWidth;
  u[5] = canvasHeight;
  u[6] = mapDimensions.width;
  u[7] = mapDimensions.height;
  // c2: lightDir.x, lightDir.y, lightDir.z, heightScale
  const invLen = 1.0 / Math.hypot(currentLightDir.x, currentLightDir.y, currentLightDir.z);
  u[8] = currentLightDir.x * invLen;
  u[9] = currentLightDir.y * invLen;
  u[10] = currentLightDir.z * invLen;
  u[11] = state.heightScale;
  // c3: ambient, waterLevel, time, displacementFactor
  u[12] = ambient;
  u[13] = waterLevel;
  u[14] = time;
  u[15] = displacementFactor;

  // c4-c7: Biome colors
  // c4: GROUND.rgb, SAND.r
  u[16] = GROUND_COLOR.r;
  u[17] = GROUND_COLOR.g;
  u[18] = GROUND_COLOR.b;
  u[19] = SAND_COLOR.r;
  // c5: SAND.gb, GRASS.rg
  u[20] = SAND_COLOR.g;
  u[21] = SAND_COLOR.b;
  u[22] = GRASS_COLOR.r;
  u[23] = GRASS_COLOR.g;
  // c6: GRASS.b, ROCK.rgb
  u[24] = GRASS_COLOR.b;
  u[25] = ROCK_COLOR.r;
  u[26] = ROCK_COLOR.g;
  u[27] = ROCK_COLOR.b;
  // c7: SNOW.rgb, padding
  u[28] = SNOW_COLOR.r;
  u[29] = SNOW_COLOR.g;
  u[30] = SNOW_COLOR.b;
  u[31] = 0.0;

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
  pass.draw(3, 1, 0, 0);
  pass.end();

  device.queue.submit([encoder.finish()]);
}
