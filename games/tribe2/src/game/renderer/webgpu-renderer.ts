import terrainShaderWGSL from './shaders/terrain.wgsl?raw';
import { Vector2D } from '../../game/types/math-types';
import { WebGPUTerrainState, Vector3D } from '../../game/types/game-types';
import { WATER_LEVEL } from '../game-consts';

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

export async function initWebGPUTerrain(
  canvas: HTMLCanvasElement,
  heightMap: number[][],
  mapDimensions: { width: number; height: number },
  cellSize: number,
  lighting?: { lightDir?: Vector3D; heightScale?: number; ambient?: number },
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
    ],
  });

  const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] });

  const pipeline = device.createRenderPipeline({
    layout: pipelineLayout,
    vertex: { module, entryPoint: 'vs_main' },
    fragment: { module, entryPoint: 'fs_main', targets: [{ format }] },
    primitive: { topology: 'triangle-list' },
  });

  // Uniform buffer (4 vec4 = 64 bytes)
  const uniformBufferSize = 4 * 4 * 4;
  const uniformBuffer = device.createBuffer({
    size: uniformBufferSize,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  // Height map texture
  const { data, width: gridW, height: gridH } = flattenHeightMapToR8(heightMap);
  const heightTexture = device.createTexture({
    size: { width: gridW, height: gridH },
    format: 'r8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  device.queue.writeTexture(
    { texture: heightTexture },
    data.buffer,
    { offset: data.byteOffset, bytesPerRow: gridW, rowsPerImage: gridH },
    { width: gridW, height: gridH },
  );
  const heightTextureView = heightTexture.createView();

  const sampler = device.createSampler({ addressModeU: 'repeat', addressModeV: 'repeat', magFilter: 'linear', minFilter: 'linear' });

  const bindGroup = device.createBindGroup({
    layout: bindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: heightTextureView },
      { binding: 2, resource: sampler },
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
    gridSize: { width: gridW, height: gridH },
    mapDimensions,
    cellSize,
    lightDir: lighting?.lightDir ?? { x: 0.3, y: 0.5, z: 0.8 },
    heightScale: lighting?.heightScale ?? 120,
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
  const { device, context, pipeline, uniformBuffer, mapDimensions, cellSize, heightScale, ambient, canvas, waterLevel } = state;

  // Use provided lightDir or fall back to state's lightDir
  const currentLightDir = lightDir ?? state.lightDir;

  // Ensure the canvas is configured to current size
  const encoder = device.createCommandEncoder();
  const textureView = context.getCurrentTexture().createView();

  // Update uniforms
  const canvasWidth = canvas.width;
  const canvasHeight = canvas.height;

  const u = new Float32Array(16);
  // c0: center.x, center.y, zoom, cellSize
  u[0] = center.x; u[1] = center.y; u[2] = zoom; u[3] = cellSize;
  // c1: canvasSize.x, canvasSize.y, mapSize.x, mapSize.y
  u[4] = canvasWidth; u[5] = canvasHeight; u[6] = mapDimensions.width; u[7] = mapDimensions.height;
  // c2: lightDir.x, lightDir.y, lightDir.z, heightScale
  const invLen = 1.0 / Math.hypot(currentLightDir.x, currentLightDir.y, currentLightDir.z);
  u[8] = currentLightDir.x * invLen; u[9] = currentLightDir.y * invLen; u[10] = currentLightDir.z * invLen; u[11] = heightScale;
  // c3: ambient, waterLevel, time, padding
  u[12] = ambient; u[13] = waterLevel; u[14] = time; u[15] = 0;

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
