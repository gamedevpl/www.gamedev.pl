// shading.ts

/**
 * Applies shading to a color based on a rotation angle.
 * @param color The base color in hexadecimal format (e.g., '#FF0000').
 * @param rotationAngle The rotation angle in radians.
 * @returns A shaded color in RGB format.
 */
export function applyShading(color: string, rotationAngle: number): string {
  const shade = Math.cos(rotationAngle) * 0.3 + 0.7; // Value between 0.4 and 1
  const rgb = parseInt(color.slice(1), 16);
  const r = Math.floor(((rgb >> 16) & 255) * shade);
  const g = Math.floor(((rgb >> 8) & 255) * shade);
  const b = Math.floor((rgb & 255) * shade);
  return `rgb(${r},${g},${b})`;
}

/**
 * Applies a gradient shading to a color based on a vertical position.
 * @param color The base color in hexadecimal format (e.g., '#FF0000').
 * @param yPosition The vertical position (0 = top, 1 = bottom).
 * @param gradientStrength The strength of the gradient effect (0 to 1).
 * @returns A shaded color in RGB format.
 */
export function applyVerticalGradient(color: string, yPosition: number, gradientStrength: number = 0.2): string {
  const shade = 1 - gradientStrength * yPosition;
  const rgb = parseInt(color.slice(1), 16);
  const r = Math.floor(((rgb >> 16) & 255) * shade);
  const g = Math.floor(((rgb >> 8) & 255) * shade);
  const b = Math.floor((rgb & 255) * shade);
  return `rgb(${r},${g},${b})`;
}

/**
 * Applies an ambient occlusion effect to a color.
 * @param color The base color in hexadecimal format (e.g., '#FF0000').
 * @param occlusionFactor A value between 0 (no occlusion) and 1 (full occlusion).
 * @returns A shaded color in RGB format.
 */
export function applyAmbientOcclusion(color: string, occlusionFactor: number): string {
  const shade = 1 - occlusionFactor * 0.5; // Adjust the 0.5 to control the strength of the effect
  const rgb = parseInt(color.slice(1), 16);
  const r = Math.floor(((rgb >> 16) & 255) * shade);
  const g = Math.floor(((rgb >> 8) & 255) * shade);
  const b = Math.floor((rgb & 255) * shade);
  return `rgb(${r},${g},${b})`;
}

/**
 * Blends two colors together.
 * @param color1 The first color in hexadecimal format (e.g., '#FF0000').
 * @param color2 The second color in hexadecimal format (e.g., '#00FF00').
 * @param blendFactor A value between 0 (100% color1) and 1 (100% color2).
 * @returns A blended color in RGB format.
 */
export function blendColors(color1: string, color2: string, blendFactor: number): string {
  const rgb1 = parseInt(color1.slice(1), 16);
  const rgb2 = parseInt(color2.slice(1), 16);
  
  const r1 = (rgb1 >> 16) & 255;
  const g1 = (rgb1 >> 8) & 255;
  const b1 = rgb1 & 255;
  
  const r2 = (rgb2 >> 16) & 255;
  const g2 = (rgb2 >> 8) & 255;
  const b2 = rgb2 & 255;
  
  const r = Math.round(r1 * (1 - blendFactor) + r2 * blendFactor);
  const g = Math.round(g1 * (1 - blendFactor) + g2 * blendFactor);
  const b = Math.round(b1 * (1 - blendFactor) + b2 * blendFactor);
  
  return `rgb(${r},${g},${b})`;
}