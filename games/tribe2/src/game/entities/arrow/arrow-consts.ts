// Arrow Constants

/** Base damage dealt by arrows */
export const ARROW_BASE_DAMAGE = 25;

/** Maximum range in pixels for arrow attacks (5x melee range) */
export const ARROW_RANGE = 150;

/** Time to aim before shooting (1 second in game time = 1/3600 hours) */
export const ARROW_BUILDUP_TIME_HOURS = 1 / 3600;

/** Cooldown after shooting an arrow in game hours */
export const ARROW_COOLDOWN_HOURS = 3;

/** Horizontal speed of arrows in pixels per second */
export const ARROW_SPEED = 80;

/** Gravity acceleration in pixels per second squared */
export const ARROW_GRAVITY = 50;

/** Duration embedded arrows remain visible (~3 seconds in game time) */
export const ARROW_EMBEDDED_DURATION_HOURS = 0.05;

/** Initial vertical velocity (simulating shooting from human height) */
export const ARROW_INITIAL_HEIGHT = 5;

/** Collision detection radius for arrows */
export const ARROW_COLLISION_RADIUS = 2;

/** Maximum flight time before arrow despawns (~1.2 seconds in game time) */
export const ARROW_MAX_FLIGHT_TIME_HOURS = 0.02;

/** Minimum flight time to prevent division by zero in trajectory calculations */
export const ARROW_MIN_FLIGHT_TIME_SECONDS = 0.01;
