/**
 * Constants for the storage spot system.
 * Defines capacity limits, interaction ranges, cooldowns, and theft detection parameters.
 */

/**
 * Maximum number of food items that can be stored in a single storage spot.
 */
export const STORAGE_SPOT_CAPACITY = 20;

/**
 * Maximum distance (in pixels) at which a human can interact with a storage spot.
 * Used for deposit, retrieve, and steal interactions.
 */
export const STORAGE_INTERACTION_RANGE = 30;

/**
 * Cooldown time (in game hours) before a storage spot can accept another deposit.
 * Prevents rapid-fire deposits from overwhelming the interaction system.
 */
export const STORAGE_DEPOSIT_COOLDOWN = 0.5;

/**
 * Cooldown time (in game hours) before a storage spot can provide another retrieval.
 * Prevents rapid-fire retrievals from overwhelming the interaction system.
 */
export const STORAGE_RETRIEVE_COOLDOWN = 0.3;

/**
 * Cooldown time (in game hours) before a storage spot can be stolen from again.
 * Longer cooldown to make stealing a more strategic decision.
 */
export const STORAGE_STEAL_COOLDOWN = 2;

/**
 * Detection range (in pixels) for theft attempts.
 * If any tribe members of the storage owner are within this range,
 * the theft attempt will be detected and prevented.
 */
export const STORAGE_STEAL_DETECTION_RANGE = 50;

/**
 * Minimum number of defending tribe members within detection range
 * needed to prevent a theft attempt.
 */
export const STORAGE_STEAL_MIN_TRIBE_MEMBERS_NEARBY = 1;
