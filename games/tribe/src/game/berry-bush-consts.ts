// Berry Bush Constants

export const BERRY_BUSH_MAX_FOOD: number = 5;
export const BERRY_BUSH_INITIAL_FOOD: number = 3;
export const BERRY_BUSH_REGENERATION_HOURS: number = 12; // Hours for 1 food to grow
export const BERRY_BUSH_LIFESPAN_GAME_HOURS: number = 940;
export const BERRY_BUSH_SPREAD_RADIUS: number = 20; // pixels
export const BERRY_BUSH_SPREAD_COOLDOWN_HOURS: number = 90;
export const INITIAL_BERRY_BUSH_COUNT: number = 45;
export const BERRY_BUSH_CLAIM_DURATION_HOURS: number = 240; // This constant represents the duration in game hours for which a human's claim on a berry bush remains active.

// Human Planting Constants
export const MAX_BUSHES_PER_TRIBE_TERRITORY = 10;
export const BERRY_COST_FOR_PLANTING = 5;
export const HUMAN_PLANTING_DURATION_HOURS = 0.5; // Time in game hours for planting action
export const AI_PLANTING_BERRY_THRESHOLD = 6; // Min berries for AI to consider planting
export const AI_PLANTING_SEARCH_RADIUS = 100; // Radius for AI to search for a planting spot
export const AI_PLANTING_CHECK_RADIUS = 300; // Radius for AI to check if bushes are already planted
export const BERRY_BUSH_PLANTING_CLEARANCE_RADIUS = 30;

// Berry Bush Spread Constants (from ecosystem)
export const MIN_BERRY_BUSH_SPREAD_CHANCE = 0.1;
export const MAX_BERRY_BUSH_SPREAD_CHANCE = 0.9;