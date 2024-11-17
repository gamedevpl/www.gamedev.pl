import { GameWorldState } from '../game-world/game-world-types';

interface FireballRenderParams {
  x: number;
  y: number;
  size: number;
  intensity?: number;
  glow?: number;
}

interface Color {
  r: number;
  g: number;
  b: number;
  a: number;
}

// Core colors for the fireball effect with adjusted alpha for better blending
const FIREBALL_COLORS: Color[] = [
  { r: 255, g: 255, b: 255, a: 0.95 }, // White hot center
  { r: 255, g: 200, b: 0, a: 0.9 }, // Orange
  { r: 255, g: 100, b: 0, a: 0.85 }, // Deep orange
  { r: 255, g: 0, b: 0, a: 0.8 }, // Red
  { r: 139, g: 69, b: 19, a: 0.7 }, // Brown
  { r: 30, g: 30, b: 30, a: 0.5 }, // Smoke
];

// Enhanced color interpolation with gamma correction
function interpolateColor(color1: Color, color2: Color, factor: number): Color {
  // Apply gamma correction for more natural color blending
  const gamma = 2.2;
  const interpolate = (a: number, b: number, f: number) => {
    // Convert to linear space
    const aLinear = Math.pow(a / 255, gamma);
    const bLinear = Math.pow(b / 255, gamma);
    // Interpolate in linear space
    const result = aLinear + (bLinear - aLinear) * f;
    // Convert back to sRGB space
    return Math.round(Math.pow(result, 1 / gamma) * 255);
  };

  return {
    r: interpolate(color1.r, color2.r, factor),
    g: interpolate(color1.g, color2.g, factor),
    b: interpolate(color1.b, color2.b, factor),
    a: color1.a + (color2.a - color1.a) * factor,
  };
}

// Enhanced gradient color calculation with glow effect
function getGradientColor(distance: number, time: number, intensity: number = 1, glow: number = 0.5): Color {
  // Add glow effect
  const glowFactor = Math.max(0, 1 - distance) * glow;
  distance = Math.max(0, distance - glowFactor);

  // Add time-based oscillation with reduced effect for stability
  const timeOffset = Math.sin(time * 0.01) * 0.05;
  const adjustedDist = Math.max(0, Math.min(1, distance + timeOffset));

  // Find colors to interpolate between
  const colorIndex = adjustedDist * (FIREBALL_COLORS.length - 1);
  const lowerIndex = Math.floor(colorIndex);
  const upperIndex = Math.min(lowerIndex + 1, FIREBALL_COLORS.length - 1);

  // Get interpolated color
  const color = interpolateColor(FIREBALL_COLORS[lowerIndex], FIREBALL_COLORS[upperIndex], colorIndex - lowerIndex);

  // Apply intensity scaling
  return {
    ...color,
    r: Math.min(255, Math.round(color.r * intensity)),
    g: Math.min(255, Math.round(color.g * intensity)),
    b: Math.min(255, Math.round(color.b * intensity)),
    a: color.a * intensity,
  };
}

// Convert color to CSS string with screen blend mode consideration
function colorToString(color: Color): string {
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a})`;
}

// Improved pixel art distance calculation with smoother transitions
function getPixelArtDistance(dx: number, dy: number, size: number): number {
  const maxDist = size / 2;
  const dist = Math.sqrt(dx * dx + dy * dy);

  // Create more steps for smoother transition while maintaining pixel art look
  const steps = 12;
  const normalizedDist = dist / maxDist;
  const steppedDist = Math.floor(normalizedDist * steps) / steps;

  // Add slight softening at step boundaries
  const softness = 0.1;
  const nextStep = Math.ceil(normalizedDist * steps) / steps;
  const blend = (normalizedDist * steps) % 1;
  const smoothBlend = blend < softness ? blend / softness : blend > 1 - softness ? (1 - blend) / softness : 1;

  return steppedDist * (1 - smoothBlend) + nextStep * smoothBlend;
}

// Enhanced noise function for more natural variation
function getNoise(x: number, y: number, time: number): number {
  const noiseScale = 0.15;
  const timeScale = 0.03;
  return Math.sin(x * noiseScale + time * timeScale) * Math.cos(y * noiseScale + time * timeScale * 0.7) * 0.07;
}

/**
 * Render a fireball effect with improved blending and glow
 * @param ctx Canvas rendering context
 * @param world Game world state
 * @param params Fireball rendering parameters
 */
export function renderFireball(
  ctx: CanvasRenderingContext2D,
  world: GameWorldState,
  params: FireballRenderParams,
): void {
  const { x, y, size } = params;
  const intensity = params.intensity ?? 1.0;
  const glow = params.glow ?? 0.5;
  const halfSize = size;

  // Save the current context state
  ctx.save();

  // Set composite operation for better blending
  ctx.globalCompositeOperation = 'screen';

  // Create pixel art style fireball with optimized size
  const pixelSize = Math.max(1, Math.floor(size / 24));

  // Pre-calculate time factor for consistency
  const timeFactor = world.time;

  // Render the fireball with improved pixelation and glow
  for (let dx = -halfSize; dx < halfSize; dx += pixelSize) {
    for (let dy = -halfSize; dy < halfSize; dy += pixelSize) {
      // Calculate base distance with improved pixel art effect
      let distance = getPixelArtDistance(dx, dy, size);

      // Add subtle noise variation
      distance += getNoise(dx, dy, timeFactor);

      // Skip pixels outside the circular shape with glow consideration
      if (distance > 1 + glow) continue;

      // Get color from enhanced gradient
      const color = getGradientColor(distance, timeFactor, intensity, glow);

      // Draw pixel with proper blending
      ctx.fillStyle = colorToString(color);
      ctx.fillRect(Math.floor(x + dx), Math.floor(y + dy), pixelSize, pixelSize);
    }
  }

  // Restore the context state
  ctx.restore();
}
