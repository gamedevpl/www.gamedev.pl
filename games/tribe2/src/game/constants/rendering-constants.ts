// Rendering Constants

/** The background color of the canvas when terrain is not visible. */
export const BACKGROUND_COLOR = '#2c5234';

/** The vertical scaling factor for the heightmap, used in pseudo-3D displacement. */
export const HEIGHT_SCALE = 120;

/** The multiplier for the pseudo-3D terrain displacement effect. */
export const TERRAIN_DISPLACEMENT_FACTOR = 0.4;

/** The color of shallow water in the terrain shader. */
export const WATER_SHALLOW_COLOR = { r: 0.4, g: 0.7, b: 0.9 };

/** The color of deep water in the terrain shader. */
export const WATER_DEEP_COLOR = { r: 0.1, g: 0.3, b: 0.6 };

/** The speed multiplier for the water animation in the terrain shader. */
export const WATER_ANIMATION_SPEED = 0.3;

/** The color of the foam at the shoreline in the terrain shader. */
export const WATER_FOAM_COLOR = { r: 0.9, g: 0.95, b: 1.0 };

/** The width of the foam at the shoreline, as a normalized value (0-1). */
export const WATER_FOAM_WIDTH = 0.03;

/** The color of ground terrain. */
export const GROUND_COLOR = { r: 0.4, g: 0.3, b: 0.2 };

/** The color of sand terrain. */
export const SAND_COLOR = { r: 0.8, g: 0.7, b: 0.5 };

/** The color of grass terrain. */
export const GRASS_COLOR = { r: 0.25, g: 0.6, b: 0.3 };

/** The color of rock terrain. */
export const ROCK_COLOR = { r: 0.5, g: 0.5, b: 0.5 };

/** The color of snow terrain. */
export const SNOW_COLOR = { r: 0.95, g: 0.98, b: 1.0 };

// Viewport and Camera Constants
/** The amount the zoom level changes per mouse scroll event. */
export const ZOOM_SPEED = 0.1;

/** The minimum zoom level (most zoomed out). */
export const MIN_ZOOM = 0.5;

/** The maximum zoom level (most zoomed in). */
export const MAX_ZOOM = 3.0;
