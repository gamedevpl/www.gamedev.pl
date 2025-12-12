// Tribe and Family Constants

// Tribe Split Constants
export const TRIBE_SPLIT_MIN_TRIBE_HEADCOUNT = 20;
export const TRIBE_SPLIT_MIN_FAMILY_HEADCOUNT_PERCENTAGE = 0.3;
export const TRIBE_SPLIT_CHECK_INTERVAL_HOURS = 24;

// Strategic Split Constants
/** Threshold (0-1) for choosing concentration vs migration strategy. If family is >= 50% of tribe, use concentration */
export const TRIBE_SPLIT_CONCENTRATION_THRESHOLD = 0.5;
/** Maximum time allowed for the gathering phase before aborting the split (in game hours) */
export const TRIBE_SPLIT_GATHERING_TIMEOUT_HOURS = 48;
/** Distance considered "arrived" at gathering target (in pixels) */
export const TRIBE_SPLIT_GATHERING_ARRIVAL_DISTANCE = 80;
/** Minimum distance to search for a safe migration spot outside current territory (in pixels) */
export const TRIBE_SPLIT_MIGRATION_MIN_DISTANCE = 400;
/** Maximum distance to search for a safe migration spot outside current territory (in pixels) */
export const TRIBE_SPLIT_MIGRATION_MAX_DISTANCE = 1200;
/** Radius to search for buildings for concentration strategy (in pixels) */
export const TRIBE_SPLIT_BUILDING_SEARCH_RADIUS = 600;

// Player Action Constants
export const PLAYER_CALL_TO_ATTACK_DURATION_HOURS: number = 10;
export const PLAYER_CALL_TO_ATTACK_RADIUS: number = 250;
export const PLAYER_CALL_TO_FOLLOW_DURATION_HOURS: number = 12;
export const PLAYER_CALL_TO_FOLLOW_RADIUS: number = 300;
export const PLAYER_TRIBE_SPLIT_COOLDOWN_HOURS = 9999;
export const FAST_FORWARD_AMOUNT_SECONDS = 10;

// Tribe control constants
export const TRIBE_ROLES_EFFECTIVE_MIN_HEADCOUNT = 10; // Minimum headcount for roles to be effective
