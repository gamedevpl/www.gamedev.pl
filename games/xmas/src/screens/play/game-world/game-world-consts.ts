// Game world dimensions
export const GAME_WORLD_WIDTH = 1000;
export const GAME_WORLD_HEIGHT = 1000;

// Fire grid configuration
export const FIRE_GRID_CELL_SIZE = 8; // Size of each cell in pixels
export const FIRE_GRID_WIDTH = Math.ceil(GAME_WORLD_WIDTH / FIRE_GRID_CELL_SIZE);
export const FIRE_GRID_HEIGHT = Math.ceil(GAME_WORLD_HEIGHT / FIRE_GRID_CELL_SIZE);