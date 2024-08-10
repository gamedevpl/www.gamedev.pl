/** How fast are the missiles */
export const MISSILE_SPEED = 10;

/** What is the radius of explosions */
export const EXPLOSION_RADIUS = 20;

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

/** Game over timeout */
export const GAME_OVER_TIMEOUT = 60;

/** How big is single sector on the map */
export const SECTOR_SIZE = 16;

/** What is the radius of city */
export const CITY_RADIUS = SECTOR_SIZE * 5;

/** How many inhabitians per sector */
export const CITY_SECTOR_POPULATION = 1000;
