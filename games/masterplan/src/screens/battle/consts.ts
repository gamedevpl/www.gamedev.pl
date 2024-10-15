/** @define {boolean} */
export const DEBUG = true;

/** const */
export const MIN_TICK = 10;
export const UPDATE_TICK = 100;

/** @const */
export const LAYER_DEFAULT = 'layer-default';

/** @const */
export const EDGE_RADIUS = 800;

/** @const */
export const MAX_LIFE = 100;

/** @const */
export const SOLDIER_WIDTH = 32;
/** @const */
export const SOLDIER_HEIGHT = 32;

/** @const */
export const DESIGN_FIELD_WIDTH = 1600;
/** @const */
export const DESIGN_FIELD_HEIGHT = 800;

/** @const */
export const MAX_COL = DESIGN_FIELD_WIDTH / SOLDIER_WIDTH;
/** @const */
export const MAX_ROW = DESIGN_FIELD_HEIGHT / SOLDIER_HEIGHT;

export const MIN_SEEK_RANGE = SOLDIER_WIDTH * 3;

/** @const */
export const SWORD_RANGE = 10;
/** @const */
export const MELEE_ATTACK_RANGE = SOLDIER_WIDTH + SWORD_RANGE;
/** @const */
export const MELEE_SEEK_RANGE = EDGE_RADIUS;
/** @const */
export const MELEE_ATTACK_COOLDOWN = 250;

/** @const */
export const RANGED_ATTACK_RANGE = EDGE_RADIUS;
/** @const */
export const RANGED_SEEK_RANGE = EDGE_RADIUS;

/** @const */
export const MIN_RANGE_ATTACK = SOLDIER_WIDTH * 5;
/** @const */
export const RANGED_ATTACK_COOLDOWN = 2000;
/** @const */
export const ARROW_RANGE = SOLDIER_WIDTH / 2;
/** @const */
export const BALL_RANGE = SOLDIER_WIDTH * 4;

/** @const */
export const DEFENCE_COOLDOWN = 1500;

/** @const */
export const SEEK_COOLDOWN = 1000;

/** @const */
export const GRID_CENTER_X = Math.floor(MAX_COL / 2);
/** @const */
export const GRID_CENTER_Y = Math.floor(MAX_ROW / 2);
