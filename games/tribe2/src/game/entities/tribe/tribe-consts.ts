// Tribe and Family Constants

// Tribe Split Constants
export const TRIBE_SPLIT_MIN_TRIBE_HEADCOUNT = 20;
export const TRIBE_SPLIT_MIN_FAMILY_HEADCOUNT_PERCENTAGE = 0.3;
export const TRIBE_SPLIT_CHECK_INTERVAL_HOURS = 24;
export const TRIBE_SPLIT_GATHER_RADIUS = 50; // Radius within which family members must gather
export const TRIBE_SPLIT_GATHER_TIMEOUT_HOURS = 48; // Maximum time to wait for family to gather
export const TRIBE_SPLIT_MIGRATION_MIN_DISTANCE = 300; // Minimum distance from current territory for migration
export const TRIBE_SPLIT_CONCENTRATION_STORAGE_RADIUS = 100; // Radius to search for storage buildings
export const TRIBE_SPLIT_PHASE_TIMEOUT_HOURS = 72; // Maximum time for any phase before resetting
export const TRIBE_SPLIT_COOLDOWN_AFTER_FAILURE_HOURS = 168; // Cooldown after a failed split attempt (1 week)

// Player Action Constants
export const PLAYER_CALL_TO_ATTACK_DURATION_HOURS: number = 10;
export const PLAYER_CALL_TO_ATTACK_RADIUS: number = 250;
export const PLAYER_CALL_TO_FOLLOW_DURATION_HOURS: number = 12;
export const PLAYER_CALL_TO_FOLLOW_RADIUS: number = 300;
export const PLAYER_TRIBE_SPLIT_COOLDOWN_HOURS = 9999;
export const FAST_FORWARD_AMOUNT_SECONDS = 10;

// Tribe control constants
export const TRIBE_ROLES_EFFECTIVE_MIN_HEADCOUNT = 10; // Minimum headcount for roles to be effective
