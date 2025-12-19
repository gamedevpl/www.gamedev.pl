/**
 * Constants for Tree entities.
 */

// Lifecycle
export const TREE_LIFESPAN_GAME_HOURS = 24 * 30 * 10; // 300 days
export const TREE_GROWTH_TIME_GAME_HOURS = 24 * 5; // 5 days
export const TREE_FALLEN_DECAY_HOURS = 48;
export const TREE_STUMP_DECAY_HOURS = 72;

// Physics / Dimensions
export const TREE_RADIUS = 20;

// Rendering Colors
export const TREE_TRUNK_COLOR_DARK = '#3b2016';
export const TREE_TRUNK_COLOR_MID = '#5c3a21';

export const TREE_FOLIAGE_COLOR_BORDER = '#376d31';
export const TREE_FOLIAGE_COLOR_MAIN = '#76a331';
export const TREE_FOLIAGE_COLOR_LIGHT = '#a6c44a';

export const TREE_SHADOW_COLOR = 'rgba(0, 0, 0, 0.25)';

export const TREE_SPREAD_RADIUS = 60;
export const TREE_SPREAD_COOLDOWN_HOURS = 24 * 7; // 1 week
export const TREE_SPREAD_CHANCE = 0.1; // 10% chance to spread when cooldown is up

// Resources
export const TREE_MIN_WOOD = 1;
export const TREE_MAX_WOOD = 5;
