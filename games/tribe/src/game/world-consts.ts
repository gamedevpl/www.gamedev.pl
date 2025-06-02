// Game Constants

export const HOURS_PER_GAME_DAY: number = 24;
export const GAME_DAY_IN_REAL_SECONDS: number = 10; // World and Movement Constants

export const MAP_WIDTH: number = 800; // pixels
export const MAP_HEIGHT: number = 600; // pixels

// Berry Bush Constants
export const BERRY_BUSH_MAX_BERRIES: number = 5;
export const BERRY_BUSH_INITIAL_BERRIES: number = 3;
export const BERRY_BUSH_REGENERATION_HOURS: number = 24; // Hours for 1 berry to grow
export const BERRY_BUSH_LIFESPAN_GAME_HOURS: number = 720; // 30 game days
export const BERRY_BUSH_SPREAD_CHANCE: number = 0.05; // 5% chance per attempt
export const BERRY_BUSH_SPREAD_RADIUS: number = 100; // pixels
export const BERRY_BUSH_SPREAD_COOLDOWN_HOURS: number = 120; // 5 game days
export const INITIAL_BERRY_BUSH_COUNT: number = 5;

// Human Constants
export const HUMAN_MAX_AGE_YEARS: number = 60; // Maximum lifespan in game years
export const HUMAN_HUNGER_INCREASE_PER_HOUR: number = 5; // Hunger increase rate
export const HUMAN_HUNGER_THRESHOLD_SLOW: number = 80; // Hunger level that triggers speed reduction
export const HUMAN_HUNGER_THRESHOLD_CRITICAL: number = 95; // Hunger level that prevents procreation
export const HUMAN_HUNGER_DEATH: number = 100; // Hunger level that causes death
export const HUMAN_BERRY_HUNGER_REDUCTION: number = 25; // How much hunger is reduced by eating a berry
export const HUMAN_BASE_SPEED: number = 100; // Base movement speed in pixels per second
export const HUMAN_SLOW_SPEED_MODIFIER: number = 0.5; // Speed modifier when hunger > threshold
export const HUMAN_INTERACTION_RANGE: number = 30; // Range in pixels for interactions
export const HUMAN_INITIAL_HUNGER: number = 50; // Initial hunger level for new humans
export const HUMAN_INITIAL_AGE: number = 20; // Initial age in years for new humans

// Human Procreation Constants
export const HUMAN_MIN_PROCREATION_AGE: number = 16; // Minimum age for procreation
export const CHILD_TO_ADULT_AGE: number = 16; // Age at which a child becomes an adult
export const HUMAN_GESTATION_PERIOD_HOURS: number = 72; // 3 game days
export const HUMAN_PROCREATION_COOLDOWN_HOURS: number = 24; // 1 game day
export const HUMAN_PREGNANCY_HUNGER_INCREASE_RATE_MODIFIER: number = 1.25; // Hunger increases 25% faster during pregnancy
export const CHILD_HUNGER_INCREASE_RATE_MODIFIER: number = 1.5; // Hunger increases 50% faster for children

// Human AI Constants
export const HUMAN_AI_HUNGER_THRESHOLD_FOR_EATING: number = 70; // AI decides to eat if hunger >= this and has berries
export const HUMAN_AI_HUNGER_THRESHOLD_FOR_GATHERING: number = 50; // AI decides to gather if hunger >= this
export const HUMAN_AI_IDLE_WANDER_CHANCE: number = 0.1; // Chance (0-1) to wander when idle
export const HUMAN_AI_WANDER_RADIUS: number = 150; // Max radius for wandering
export const PROCREATION_MIN_NEARBY_BERRY_BUSHES: number = 2; // Minimum number of berry bushes needed nearby for AI to consider procreation
export const PROCREATION_FOOD_SEARCH_RADIUS: number = 200; // Radius in pixels to search for food sources when considering procreation
