import { Asset } from '../../../generator-core/src/assets-types';

// Type definitions for water rendering
type WaterColors = {
  deep: string;
  medium: string;
  shallow: string;
  foam: string;
  highlight: string;
  reflection: string;
};

type WaveParameters = {
  amplitude: number;
  frequency: number;
  speed: number;
  reflectionIntensity: number;
  foamIntensity: number;
};

// Water color palettes for different stances
const waterColorPalettes: Record<string, WaterColors> = {
  default: {
    deep: '#1a5d7e',
    medium: '#2389ad',
    shallow: '#5cb8d6',
    foam: '#ffffff',
    highlight: '#a0e8ff',
    reflection: '#d0f4ff',
  },
  calm: {
    deep: '#1e6e8f',
    medium: '#2c9fc9',
    shallow: '#6bc5e0',
    foam: '#ffffff',
    highlight: '#b0f0ff',
    reflection: '#e0f8ff',
  },
  windy: {
    deep: '#164d69',
    medium: '#1d7494',
    shallow: '#4ca5c2',
    foam: '#ffffff',
    highlight: '#8ad6f0',
    reflection: '#c0ecff',
  },
};

// Wave parameters for different stances
const waveParameters: Record<string, WaveParameters> = {
  default: {
    amplitude: 0.4,
    frequency: 2.0,
    speed: 1.0,
    reflectionIntensity: 0.6,
    foamIntensity: 0.3,
  },
  calm: {
    amplitude: 0.2,
    frequency: 1.5,
    speed: 0.7,
    reflectionIntensity: 0.8,
    foamIntensity: 0.1,
  },
  windy: {
    amplitude: 0.6,
    frequency: 3.0,
    speed: 1.4,
    reflectionIntensity: 0.4,
    foamIntensity: 0.7,
  },
};

/**
 * Creates a wave pattern value at a specific position
 * @param x - X coordinate
 * @param y - Y coordinate
 * @param time - Animation progress (0-1)
 * @param params - Wave parameters
 * @returns Wave height value (0-1)
 */
const getWaveValue = (x: number, y: number, time: number, params: WaveParameters): number => {
  // Use deterministic wave functions instead of random
  const wave1 = Math.sin(x * params.frequency * 0.1 + time * Math.PI * 2 * params.speed) * params.amplitude;
  const wave2 = Math.cos(y * params.frequency * 0.1 + time * Math.PI * 2 * params.speed * 0.7) * params.amplitude * 0.5;
  const wave3 =
    Math.sin((x + y) * params.frequency * 0.05 + time * Math.PI * 2 * params.speed * 1.3) * params.amplitude * 0.3;

  // Combine waves and normalize to 0-1 range
  return (wave1 + wave2 + wave3 + 1) * 0.5;
};
/**
 * Draws a base water layer with a gradient
 * @param ctx - Canvas rendering context
 * @param x - X position
 * @param y - Y position
 * @param width - Width of the water tile
 * @param height - Height of the water tile
 * @param colors - Water color palette
 */
const drawWaterBase = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  colors: WaterColors,
): void => {
  // Create gradient for water depth
  const gradient = ctx.createLinearGradient(x, y, x, y + height);
  gradient.addColorStop(0, colors.shallow);
  gradient.addColorStop(0.5, colors.medium);
  gradient.addColorStop(1, colors.deep);

  ctx.fillStyle = gradient;
  ctx.fillRect(x, y, width, height);
};

/**
 * Draws water wave patterns
 * @param ctx - Canvas rendering context
 * @param x - X position
 * @param y - Y position
 * @param width - Width of the water tile
 * @param height - Height of the water tile
 * @param progress - Animation progress (0-1)
 * @param params - Wave parameters
 * @param colors - Water color palette
 */
const drawWavePatterns = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  progress: number,
  params: WaveParameters,
  colors: WaterColors,
): void => {
  const pixelSize = Math.min(width, height) / 32; // Size of each "pixel" for pixel art style
  const rows = Math.ceil(height / pixelSize);
  const cols = Math.ceil(width / pixelSize);

  ctx.fillStyle = colors.medium;

  // Draw wave patterns using small rectangles for pixel art style
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const posX = x + col * pixelSize;
      const posY = y + row * pixelSize;

      // Get wave value at this position
      const waveValue = getWaveValue(col * 10, row * 10, progress, params);

      // Only draw medium-colored pixels where wave value is within certain range
      // This creates the wave pattern effect
      if (waveValue > 0.45 && waveValue < 0.55) {
        ctx.fillRect(posX, posY, pixelSize, pixelSize);
      }
    }
  }
};

/**
 * Draws water reflections
 * @param ctx - Canvas rendering context
 * @param x - X position
 * @param y - Y position
 * @param width - Width of the water tile
 * @param height - Height of the water tile
 * @param progress - Animation progress (0-1)
 * @param params - Wave parameters
 * @param colors - Water color palette
 */
const drawReflections = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  progress: number,
  params: WaveParameters,
  colors: WaterColors,
): void => {
  const pixelSize = Math.min(width, height) / 32;
  const rows = Math.ceil(height / pixelSize);
  const cols = Math.ceil(width / pixelSize);

  ctx.fillStyle = colors.reflection;

  // Draw light reflections
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const posX = x + col * pixelSize;
      const posY = y + row * pixelSize;

      // Get wave value at this position with offset for reflection effect
      const waveValue = getWaveValue(col * 15 + 50, row * 15 + 50, progress, params);

      // Draw reflection only at certain wave heights
      // The reflection intensity parameter controls how many reflections appear
      if (waveValue > 0.7 && waveValue < 0.7 + params.reflectionIntensity * 0.2) {
        ctx.fillRect(posX, posY, pixelSize, pixelSize);
      }
    }
  }
};
/**
 * Draws foam on wave crests
 * @param ctx - Canvas rendering context
 * @param x - X position
 * @param y - Y position
 * @param width - Width of the water tile
 * @param height - Height of the water tile
 * @param progress - Animation progress (0-1)
 * @param params - Wave parameters
 * @param colors - Water color palette
 */
const drawFoam = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  progress: number,
  params: WaveParameters,
  colors: WaterColors,
): void => {
  const pixelSize = Math.min(width, height) / 32;
  const rows = Math.ceil(height / pixelSize);
  const cols = Math.ceil(width / pixelSize);

  ctx.fillStyle = colors.foam;

  // Draw foam on wave crests
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const posX = x + col * pixelSize;
      const posY = y + row * pixelSize;

      // Get wave value at this position
      const waveValue = getWaveValue(col * 12, row * 12, progress, params);

      // Draw foam only at the highest wave points
      // The foam intensity parameter controls how much foam appears
      if (waveValue > 0.85 - params.foamIntensity * 0.1) {
        // Smaller foam pixels for better detail
        ctx.fillRect(posX + pixelSize * 0.25, posY + pixelSize * 0.25, pixelSize * 0.5, pixelSize * 0.5);
      }
    }
  }
};

/**
 * Draws highlights on water surface
 * @param ctx - Canvas rendering context
 * @param x - X position
 * @param y - Y position
 * @param width - Width of the water tile
 * @param height - Height of the water tile
 * @param progress - Animation progress (0-1)
 * @param params - Wave parameters
 * @param colors - Water color palette
 */
const drawHighlights = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  progress: number,
  params: WaveParameters,
  colors: WaterColors,
): void => {
  const pixelSize = Math.min(width, height) / 32;
  const rows = Math.ceil(height / pixelSize);
  const cols = Math.ceil(width / pixelSize);

  ctx.fillStyle = colors.highlight;

  // Draw highlights
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const posX = x + col * pixelSize;
      const posY = y + row * pixelSize;

      // Get wave value at this position with different offset for highlight effect
      const waveValue = getWaveValue(col * 8 + 25, row * 8 + 25, progress, params);

      // Draw highlights at medium-high wave points
      if (waveValue > 0.6 && waveValue < 0.7) {
        ctx.fillRect(posX, posY, pixelSize, pixelSize);
      }
    }
  }
};

/**
 * Renders a complete water tile with all effects
 * @param ctx - Canvas rendering context
 * @param x - X position
 * @param y - Y position
 * @param width - Width of the water tile
 * @param height - Height of the water tile
 * @param progress - Animation progress (0-1)
 * @param stance - Water stance (default, calm, or windy)
 */
const renderWaterTile = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  progress: number,
  stance: string,
): void => {
  // Get colors and parameters for the requested stance
  const colors = waterColorPalettes[stance] || waterColorPalettes.default;
  const params = waveParameters[stance] || waveParameters.default;

  // Normalize progress to 0-1 range if it's not already
  const normalizedProgress = progress % 1;

  // Draw each layer of the water effect
  drawWaterBase(ctx, x, y, width, height, colors);
  drawWavePatterns(ctx, x, y, width, height, normalizedProgress, params, colors);
  drawReflections(ctx, x, y, width, height, normalizedProgress, params, colors);
  drawHighlights(ctx, x, y, width, height, normalizedProgress, params, colors);
  drawFoam(ctx, x, y, width, height, normalizedProgress, params, colors);
};

// Export the water asset
export const Water2D: Asset = {
  name: 'Water2D',
  description: `**Objective:** Generate JavaScript code to render a seamlessly tileable 2D water asset in a pixel art style, suitable for top-down or pseudo-isometric views. The rendering must be deterministic (no random functions).

**Visual Style:**

*   The output should visually resemble a pixel art water tile.
*   The rendering should aim to convey enhanced depth and the appearance of realistic wave animations through static visual cues.
*   The generated code should be structured to allow for distinct visual representations corresponding to the specified stances.
*   The rendered tile must not have any borders to ensure seamless tiling.

**Projection:**

*   The rendered visual should be appropriate for a top-down or pseudo-isometric perspective.

**Implementation Constraints:**

*   The generated JavaScript code **must not** use any random number generation functions to ensure consistent output across multiple calls.
*   The code should be structured to efficiently render a single water tile that can be repeated to create larger water bodies.
*   Do not offscreen canvases, do not use document or window objects, and do not use any external libraries.

**Stances / Visual Variations (to be implemented as distinct rendering logic within the generated code):**

*   **Default:** Render a water tile with a balanced appearance, suggesting gentle waves and subtle light reflections.
*   **Calm:** Render a water tile depicting calm water with minimal ripple detail and enhanced, though still subtle, reflective highlights.
*   **Windy:** Render a water tile showing choppy water with more pronounced wave crests (potentially with white highlights to suggest foam) and less prominent reflections.`,
  stances: ['default', 'calm', 'windy'],
  render: (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    progress: number,
    stance: string,
  ): void => {
    // Direction doesn't affect the water rendering
    renderWaterTile(ctx, x, y, width, height, progress, stance);
  },
};
