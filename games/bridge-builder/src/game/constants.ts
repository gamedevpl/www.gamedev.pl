/**
 * Game constants for Bridge Builder
 */

// View dimensions (pixel art resolution)
export const VIEW_W = 480;
export const VIEW_H = 270;
export const SCALE = 28; // pixels per meter when rendering
export const GRID = 0.5; // meters grid snap

// Budget
export const BUDGET = 1200;

// Materials configuration
export const MATERIALS = {
  wood: {
    label: 'Wood',
    costPerM: 20,
    color: '#caa35a',
    jointHz: 4.2,
    damping: 0.62,
    breakPerM: 220,
  },
  steel: {
    label: 'Steel',
    costPerM: 45,
    color: '#9aa7b6',
    jointHz: 6.0,
    damping: 0.45,
    breakPerM: 520,
  },
  road: {
    label: 'Road',
    costPerM: 32,
    color: '#6e7c86',
    jointHz: 5.0,
    damping: 0.55,
    breakPerM: 420,
  },
} as const;

export type MaterialType = keyof typeof MATERIALS;

// Color palette for pixel art
export const PALETTE = {
  sky1: '#6db7ff',
  sky2: '#4c8de0',
  cloud: '#cfe7ff',
  cliff: '#2f3b44',
  cliff2: '#1e262c',
  grass: '#2f7d3c',
  dirt: '#704c2a',
  track: '#3c444c',
  ui: '#0b1220',
  ui2: '#111c30',
  text: '#e8f0ff',
  warn: '#ffcc66',
  bad: '#ff6b6b',
  good: '#5de38c',
} as const;

// Level geometry
export const LEVEL = {
  leftPlatformX: 3,
  rightPlatformX: 21,
  platformY: 2.6,
  gapStart: 6.0,
  gapEnd: 18.0,
  floorY: 0.0,
  worldMinX: -2,
  worldMaxX: 26,
} as const;
