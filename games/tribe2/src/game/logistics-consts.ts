/**
 * Logistics System Constants
 *
 * Configuration constants for the demand-driven tribe logistics system.
 */

// Timing constants (in game hours)
/** How long a pending demand can remain before being considered stale and removed */
export const LOGISTICS_DEMAND_STALE_TIMEOUT_HOURS = 24;

/** How long a claimed demand can remain before the claim is reset (mover died/stuck) */
export const LOGISTICS_CLAIM_TIMEOUT_HOURS = 6;

/** How long a mover will wait at an empty supply source for forecast resources */
export const LOGISTICS_SUPPLY_WAIT_TIMEOUT_HOURS = 2;

/** How long after ETA a forecast supply entry expires */
export const LOGISTICS_FORECAST_EXPIRY_HOURS = 4;

/** How often to run cleanup on the logistics registry */
export const LOGISTICS_CLEANUP_INTERVAL_HOURS = 1;

// Distance constants (in pixels)
/** Maximum distance a mover will travel for a single task (one-way) */
export const LOGISTICS_MAX_MOVER_TRAVEL_DISTANCE = 600;

/** Distance threshold for considering a relay (if total distance > this, consider relay) */
export const LOGISTICS_RELAY_DISTANCE_THRESHOLD = 400;

/** How close to a supply source a mover needs to be to pick up */
export const LOGISTICS_PICKUP_DISTANCE = 30;

/** How close to a requester a mover needs to be to deliver */
export const LOGISTICS_DELIVERY_DISTANCE = 30;

// Behavior thresholds
/** Hunger ratio (0-1) above which a mover should prioritize self-sustain */
export const LOGISTICS_MOVER_HUNGER_SELF_SUSTAIN_THRESHOLD = 0.7;

/** Hunger ratio (0-1) above which a consumer should register a demand */
export const LOGISTICS_CONSUMER_HUNGER_DEMAND_THRESHOLD = 0.5;

/** Hunger ratio (0-1) for critical priority demand (starvation) */
export const LOGISTICS_CRITICAL_HUNGER_THRESHOLD = 0.85;

// Cooldowns
/** Cooldown between mover task searches (to avoid constant scanning) */
export const LOGISTICS_MOVER_SEARCH_COOLDOWN_HOURS = 0.5;

/** Cooldown between consumer demand updates */
export const LOGISTICS_CONSUMER_DEMAND_COOLDOWN_HOURS = 1;

// Relay constants
/** Maximum time a relay mover will hold position waiting for pickup */
export const LOGISTICS_RELAY_HOLD_TIMEOUT_HOURS = 4;
