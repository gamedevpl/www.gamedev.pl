/** How fast are the missiles */
export const MISSILE_SPEED = 20;

/** How fast are the interceptors (slightly faster than missiles) */
export const INTERCEPTOR_SPEED = MISSILE_SPEED * 1.5;

/** Duration of launch site mode change */
export const MODE_CHANGE_DURATION = 5;

/** What is the radius of explosions */
export const EXPLOSION_RADIUS = 20;

/** How close the interceptor must be in order to destroy the missile */
export const INTERCEPT_RADIUS = 1;

/** How fast is the explosion */
export const EXPLOSION_SPEED = 5;

/** How long does the explosion take */
export const EXPLOSION_DURATION = EXPLOSION_RADIUS / EXPLOSION_SPEED;

/** Explosion damage ratio */
export const EXPLOSION_DAMAGE_RATIO = 0.5;

/** Minimum explosion damage */
export const MIN_EXPLOSION_DAMAGE = 500;

/** World update step in seconds */
export const WORLD_UPDATE_STEP = 0.05;

/** Launch cooldown in seconds */
export const LAUNCH_COOLDOWN = 5;

/** Launch cooldown in seconds */
export const INTERCEPTOR_LAUNCH_COOLDOWN = 4;

/** Game over timeout */
export const GAME_OVER_TIMEOUT = 60;

/** How big is single sector on the map */
export const SECTOR_SIZE = 16;

/** What is the radius of city */
export const CITY_RADIUS = SECTOR_SIZE * 5;

/** How many inhabitians per sector */
export const CITY_SECTOR_POPULATION = 1000;

/** Maximum range of interceptors */
export const INTERCEPTOR_MAX_RANGE = CITY_RADIUS * 4;

/** Strategy update cooldown */
export const STRATEGY_UPDATE_COOLDOWN = 10;

/** Unit movement speed */
export const UNIT_MOVEMENT_SPEED = MISSILE_SPEED / 10;

/** Default total amount of unit capacity for state */
export const INITIAL_STATE_UNITS = 0;

/** Launch generation interval (in seconds) */
export const LAUNCH_GENERATION_INTERVAL = 0.1;

/** Strategy update interval (in seconds) */
export const STRATEGY_UPDATE_INTERVAL = 0.1;

/** Size of the unit rectangle */
export const UNIT_SIZE = 10;