// Tribe and Family Constants

// Tribe Split Constants
export const TRIBE_SPLIT_MIN_TRIBE_HEADCOUNT = 20;
export const TRIBE_SPLIT_MIN_FAMILY_HEADCOUNT_PERCENTAGE = 0.2;
export const TRIBE_SPLIT_CHECK_INTERVAL_HOURS = 24;
export const TRIBE_SPLIT_GATHER_RADIUS = 50; // Radius within which family members must gather
export const TRIBE_SPLIT_GATHER_TIMEOUT_HOURS = 48; // Maximum time to wait for family to gather
export const TRIBE_SPLIT_CONCENTRATION_STORAGE_RADIUS = 100; // Radius to search for storage buildings
export const TRIBE_SPLIT_PHASE_TIMEOUT_HOURS = 160; // Maximum time for any phase before resetting
export const TRIBE_SPLIT_COOLDOWN_AFTER_FAILURE_HOURS = 72; // Cooldown after a failed split attempt (1 week)

// Player Action Constants
export const PLAYER_TRIBE_SPLIT_COOLDOWN_HOURS = 9999;
export const FAST_FORWARD_AMOUNT_SECONDS = 10;

// Tribe control constants
export const TRIBE_BUILDINGS_MIN_HEADCOUNT = 5; // Minimum headcount to allow building placement
export const TRIBE_ROLES_EFFECTIVE_MIN_HEADCOUNT = 10; // Minimum headcount for roles to be effective

// Army Control constants - default priority weights for warrior objectives (0-10)
export const DEFAULT_ARMY_CONTROL_PROTECT_HOMELAND = 5;
export const DEFAULT_ARMY_CONTROL_EXPAND_BORDERS = 5;
export const DEFAULT_ARMY_CONTROL_INVADE_ENEMIES = 5;

// Tribe Merge Constants
export const TRIBE_MERGE_CHECK_INTERVAL_HOURS = 12; // How often to check for orphaned tribes
export const TRIBE_MERGE_MIN_FAMILY_CONNECTION_STRENGTH = 1; // Minimum family relationship strength to trigger merge
