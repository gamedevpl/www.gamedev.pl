// Core Game Constants

// World and Movement Constants
export const MAP_WIDTH = 3000; // pixels
export const MAP_HEIGHT = 3000; // pixels
export const HEIGHT_MAP_RESOLUTION = 50; // pixels per height map cell

// Rendering Constants
export const BACKGROUND_COLOR = '#2c5234';
export const WATER_LEVEL = 0.45; // Water level, normalized (0-1)
export const WATER_SHALLOW_COLOR = { r: 0.4, g: 0.7, b: 0.9 }; // Light blue for shallow water
export const TERRAIN_DISPLACEMENT_FACTOR = 0.4; // How much to displace terrain vertically for pseudo-3D effect
export const WATER_DEEP_COLOR = { r: 0.1, g: 0.3, b: 0.6 }; // Darker blue for deep water
export const WATER_ANIMATION_SPEED = 0.3; // Speed multiplier for water animation (lower = slower)
export const WATER_FOAM_COLOR = { r: 0.9, g: 0.95, b: 1.0 }; // White foam color
export const WATER_FOAM_WIDTH = 0.03; // Width of foam at shoreline

// Viewport and Camera Constants
export const ZOOM_SPEED = 0.1; // How much the zoom changes per scroll event
export const MIN_ZOOM = 0.5; // Furthest the camera can zoom out
export const MAX_ZOOM = 3.0; // Closest the camera can zoom in
