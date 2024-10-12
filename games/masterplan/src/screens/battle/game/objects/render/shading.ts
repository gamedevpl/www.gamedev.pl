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
