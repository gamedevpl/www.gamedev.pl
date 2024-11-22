import { RenderState } from './render-state';
import { GRID_CELL_SIZE, GRID_HEIGHT, GRID_WIDTH } from './fire-render-types';

/**
 * Main rendering function for fireballs and fire effects
 */
export function renderFireballs(ctx: CanvasRenderingContext2D, render: RenderState): void {
  // Save the current context state
  ctx.save();

  // Set composite operation for better blending
  ctx.globalCompositeOperation = 'screen';

  // Render the fire grid using ImageData
  renderFireGrid(ctx, render.fire.grid);

  // Restore the context state
  ctx.restore();
}

/**
 * Render a single fire cell using the pre-allocated buffer
 */
function renderFireCell(buffer: Uint8ClampedArray, x: number, y: number, temperature: number) {
  if (temperature <= 0) return;

  const [r, g, b, a] = calculateFirePixelColor(temperature);
  setPixelInBuffer(buffer, x, y, r, g, b, a);
}

/**
 * Render the entire fire grid efficiently using ImageData
 */
function renderFireGrid(ctx: CanvasRenderingContext2D, grid: RenderState['fire']['grid']) {
  const buffer = getFireBuffer();

  // Clear the buffer before rendering new frame
  clearImageBuffer(buffer.pixels);

  // Batch render all cells
  for (let y = 0; y < GRID_HEIGHT; y++) {
    for (let x = 0; x < GRID_WIDTH; x++) {
      const cell = grid[y][x];
      renderFireCell(buffer.pixels, x, y, cell.temperature);
    }
  }

  // Scale the ImageData to match the cell size
  const scaledWidth = GRID_WIDTH * GRID_CELL_SIZE;
  const scaledHeight = GRID_HEIGHT * GRID_CELL_SIZE;

  // Draw the original ImageData
  buffer.ctx.putImageData(buffer.imageData, 0, 0);

  // Use drawImage for high-quality scaling
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(buffer.canvas, 0, 0, GRID_WIDTH, GRID_HEIGHT, 0, 0, scaledWidth, scaledHeight);
}

// Color constants for fire rendering
const FIRE_COLOR = {
  RED: 255,
  GREEN_MULTIPLIER: 200, // Controls the amount of green based on temperature
  BLUE: 0,
  BASE_ALPHA: 255, // Full opacity for fire pixels
};

// ImageData buffer constants
const BYTES_PER_PIXEL = 4; // RGBA format

// ImageData buffer type for efficient rendering
type FireImageBuffer = {
  imageData: ImageData;
  pixels: Uint8ClampedArray;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
};

// Pre-allocated buffer for fire rendering
let fireBuffer: FireImageBuffer | null = null;

/**
 * Initialize or get the fire buffer
 */
function getFireBuffer(): FireImageBuffer {
  if (!fireBuffer) {
    fireBuffer = createFireImageBuffer();
  }
  return fireBuffer;
}

/**
 * Creates a new ImageData buffer for fire rendering
 */
function createFireImageBuffer(): FireImageBuffer {
  const imageData = new ImageData(GRID_WIDTH, GRID_HEIGHT);
  // Create a temporary canvas for scaling
  const canvas = document.createElement('canvas');
  canvas.width = GRID_WIDTH;
  canvas.height = GRID_HEIGHT;
  const ctx = canvas.getContext('2d')!;

  return {
    imageData,
    pixels: imageData.data,
    canvas,
    ctx,
  };
}

/**
 * Calculate pixel color components based on temperature
 */
function calculateFirePixelColor(temperature: number): [r: number, g: number, b: number, a: number] {
  if (temperature <= 0) {
    return [0, 0, 0, 0];
  }

  const intensity = Math.min(1, Math.max(0, temperature));
  return [
    FIRE_COLOR.RED,
    Math.floor(FIRE_COLOR.GREEN_MULTIPLIER * intensity),
    FIRE_COLOR.BLUE,
    Math.floor(FIRE_COLOR.BASE_ALPHA * intensity),
  ];
}

/**
 * Set pixel color in the buffer at specified coordinates
 */
function setPixelInBuffer(
  buffer: Uint8ClampedArray,
  x: number,
  y: number,
  r: number,
  g: number,
  b: number,
  a: number,
): void {
  const index = (y * GRID_WIDTH + x) * BYTES_PER_PIXEL;
  buffer[index] = r;
  buffer[index + 1] = g;
  buffer[index + 2] = b;
  buffer[index + 3] = a;
}

/**
 * Clear the image buffer (set all pixels to transparent)
 */
function clearImageBuffer(buffer: Uint8ClampedArray): void {
  buffer.fill(0);
}
