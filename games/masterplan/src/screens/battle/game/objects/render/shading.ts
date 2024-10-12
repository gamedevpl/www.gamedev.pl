// shading.ts

export function applyShading(color: string, rotationAngle: number, alpha: number = 1): string {
  const shade = Math.cos(rotationAngle) * 0.3 + 0.7; // Value between 0.4 and 1
  const rgb = parseInt(color.slice(1), 16);
  const r = Math.floor(((rgb >> 16) & 255) * shade);
  const g = Math.floor(((rgb >> 8) & 255) * shade);
  const b = Math.floor((rgb & 255) * shade);
  return `rgba(${r},${g},${b},${alpha})`;
}
