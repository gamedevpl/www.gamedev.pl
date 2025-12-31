// Tribe and Family Constants

// Tribe Split Constants
export const TRIBE_SPLIT_MIN_TRIBE_HEADCOUNT = 30;
export const TRIBE_SPLIT_MIN_FAMILY_HEADCOUNT_PERCENTAGE = 0.4;
export const TRIBE_SPLIT_CHECK_INTERVAL_HOURS = 24;
export const TRIBE_SPLIT_GATHER_RADIUS = 50; // Radius within which family members must gather
export const TRIBE_SPLIT_CONCENTRATION_STORAGE_RADIUS = 100; // Radius to search for storage buildings
export const TRIBE_SPLIT_PHASE_TIMEOUT_HOURS = 160; // Maximum time for any phase before resetting
export const TRIBE_SPLIT_COOLDOWN_AFTER_FAILURE_HOURS = 72; // Cooldown after a failed split attempt (1 week)

// Player Action Constants
export const FAST_FORWARD_AMOUNT_SECONDS = 10;

// Tribe control constants
export const TRIBE_BUILDINGS_MIN_HEADCOUNT = 2; // Minimum headcount to allow building placement
export const TRIBE_ROLES_EFFECTIVE_MIN_HEADCOUNT = 10; // Minimum headcount for roles to be effective
export const TRIBE_ARMY_CONTROL_MIN_HEADCOUNT = 15; // Minimum headcount to enable army control

// Army Control constants - default priority weights for warrior objectives (0-10)
export const DEFAULT_ARMY_CONTROL_PROTECT_HOMELAND = 5;
export const DEFAULT_ARMY_CONTROL_EXPAND_BORDERS = 5;
export const DEFAULT_ARMY_CONTROL_INVADE_ENEMIES = 5;
