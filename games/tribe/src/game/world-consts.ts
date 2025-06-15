// Game Constants

export const HOURS_PER_GAME_DAY: number = 24;
export const GAME_DAY_IN_REAL_SECONDS: number = 10; // World and Movement Constants

export const MAP_WIDTH: number = 1600; // pixels
export const MAP_HEIGHT: number = 1200; // pixels

// Berry Bush Constants
export const BERRY_BUSH_MAX_BERRIES: number = 5;
export const BERRY_BUSH_INITIAL_BERRIES: number = 3;
export const BERRY_BUSH_REGENERATION_HOURS: number = 12; // Hours for 1 berry to grow
export const BERRY_BUSH_LIFESPAN_GAME_HOURS: number = 940;
export const BERRY_BUSH_SPREAD_CHANCE: number = 0.43; // 40% chance per attempt
export const BERRY_BUSH_SPREAD_RADIUS: number = 20; // pixels
export const BERRY_BUSH_SPREAD_COOLDOWN_HOURS: number = 60;
export const INITIAL_BERRY_BUSH_COUNT: number = 45;
export const BERRY_BUSH_CLAIM_DURATION_HOURS: number = 24; // This constant represents the duration in game hours for which a human's claim on a berry bush remains active.

// Human Constants
export const HUMAN_YEAR_IN_REAL_SECONDS: number = 10;
export const HUMAN_MAX_AGE_YEARS: number = 60; // Maximum lifespan in game years
export const HUMAN_HUNGER_INCREASE_PER_HOUR: number = 5; // Hunger increase rate
export const HUMAN_HUNGER_THRESHOLD_SLOW: number = 80; // Hunger level that triggers speed reduction
export const HUMAN_HUNGER_THRESHOLD_CRITICAL: number = 95; // Hunger level that prevents procreation
export const HUMAN_HUNGER_DEATH: number = 100; // Hunger level that causes death
export const HUMAN_BERRY_HUNGER_REDUCTION: number = 25; // How much hunger is reduced by eating a berry
export const HUMAN_BASE_SPEED: number = 10; // Base movement speed in pixels per second
export const HUMAN_SLOW_SPEED_MODIFIER: number = 0.5; // Speed modifier when hunger > threshold
export const HUMAN_INTERACTION_RANGE: number = 30; // Range in pixels for interactions
export const HUMAN_INITIAL_HUNGER: number = 50; // Initial hunger level for new humans
export const HUMAN_INITIAL_AGE: number = 20; // Initial age in years for new humans
export const HUMAN_OLD_AGE_FOR_SPEED_REDUCTION_THRESHOLD: number = HUMAN_MAX_AGE_YEARS * 0.8; // Age at which humans start moving slower (80% of max age)
export const HUMAN_OLD_AGE_SPEED_MODIFIER: number = 0.7; // Speed modifier for old age (e.g., 0.7 for 70% speed)

// Human Procreation Constants
export const HUMAN_MIN_PROCREATION_AGE: number = 16; // Minimum age for procreation
export const HUMAN_FEMALE_MAX_PROCREATION_AGE: number = 40; // Maximum age for a female to be able to procreate
export const CHILD_TO_ADULT_AGE: number = 16; // Age at which a child becomes an adult
export const HUMAN_GESTATION_PERIOD_HOURS: number = 72 / 3; // 3 game days
export const HUMAN_PROCREATION_COOLDOWN_HOURS: number = 24; // 1 game day
export const HUMAN_PREGNANCY_HUNGER_INCREASE_RATE_MODIFIER: number = 1.25; // Hunger increases 25% faster during pregnancy
export const CHILD_HUNGER_INCREASE_RATE_MODIFIER: number = 1.5; // Hunger increases 50% faster for children
export const CHILD_HUNGER_THRESHOLD_FOR_REQUESTING_FOOD: number = 60; // Hunger level for child to request food from parent
export const PARENT_FEEDING_RANGE: number = 50; // Range in pixels for parent to feed child
export const PARENT_FEED_CHILD_COOLDOWN_HOURS: number = 1; // Cooldown in game hours for a parent after feeding a child
export const CHILD_FOOD_SEEK_PARENT_SEARCH_RADIUS: number = 150; // Radius in pixels for a hungry child to search for a parent with food

// Constants for Adult Children Feeding Old Parents
export const HUMAN_OLD_AGE_THRESHOLD: number = HUMAN_MAX_AGE_YEARS * 0.75; // Age at which a human is considered 'old' for receiving care
export const HUMAN_OLD_PARENT_HUNGER_THRESHOLD_FOR_FEEDING: number = 80; // Hunger level for an old parent to be fed by an adult child
export const ADULT_CHILD_FEEDING_RANGE: number = 50; // Range in pixels for an adult child to feed an old parent
export const ADULT_CHILD_FEED_PARENT_COOLDOWN_HOURS: number = 1; // Cooldown in game hours for an adult child after feeding a parent

// Human Corpse Constants
export const HUMAN_CORPSE_DECAY_TIME_HOURS: number = 4; // Corpses remain for 4 game hours

// Human Attack Constants
export const HUMAN_ATTACK_RANGE: number = 30; // Range in pixels for attack interaction
export const HUMAN_ATTACK_COOLDOWN_HOURS: number = 1; // Cooldown in game hours for a human after attacking
export const HUMAN_ATTACK_STUN_CHANCE: number = 0.5; // Chance (0-1) to stun a target on attack
export const HUMAN_ATTACK_KILL_CHANCE: number = 0.5; // Chance (0-1) to kill a target on attack
export const HUMAN_STUN_DURATION_HOURS: number = 2; // Duration in game hours for a stun

// Human AI Constants
export const HUMAN_AI_HUNGER_THRESHOLD_FOR_EATING: number = 60; // AI decides to eat if hunger >= this and has berries
export const HUMAN_AI_HUNGER_THRESHOLD_FOR_GATHERING: number = 50; // AI decides to gather if hunger >= this
export const HUMAN_AI_IDLE_WANDER_CHANCE: number = 0.1; // Chance (0-1) to wander when idle
export const HUMAN_AI_WANDER_RADIUS: number = 150; // Max radius for wandering
export const CHILD_MAX_WANDER_DISTANCE_FROM_PARENT: number = 200;
export const FEMALE_PARTNER_MAX_WANDER_DISTANCE_FROM_MALE_PARTNER: number = 300;
export const PROCREATION_MIN_NEARBY_BERRY_BUSHES: number = 2; // Minimum number of berry bushes needed nearby for AI to consider procreation
export const PROCREATION_FOOD_SEARCH_RADIUS: number = 200; // Radius in pixels to search for food sources when considering procreation
export const AI_ATTACK_HUNGER_THRESHOLD: number = 85;
export const AI_ATTACK_TARGET_MIN_BERRY_COUNT: number = 5;
export const AI_DEFEND_CLAIMED_BUSH_RANGE: number = 100; // Range to defend claimed bush
export const AI_GATHERING_TERRITORY_RADIUS: number = 150; // Radius to look for other bushes near a claimed one

// Highlight Colors
export const PLAYER_HIGHLIGHT_COLOR: string = '#4CAF50'; // Green
export const PLAYER_PARENT_HIGHLIGHT_COLOR: string = '#FF5722'; // Deep Orange
export const PLAYER_PARTNER_HIGHLIGHT_COLOR: string = '#9C27B0'; // Purple
export const PLAYER_CHILD_HIGHLIGHT_COLOR: string = '#2196F3'; // Blue
export const PLAYER_HEIR_HIGHLIGHT_COLOR: string = '#FFC107'; // Amber/Gold
export const FAMILY_CLAIM_COLOR: string = '#FFD700'; // Gold
export const NON_FAMILY_CLAIM_COLOR: string = '#DC143C'; // Crimson

// Crown Sizes
export const PLAYER_CROWN_SIZE: number = 12; // Size of the crown for player character
export const PLAYER_HEIR_CROWN_SIZE: number = 8; // Size of the crown for player's heir
export const PLAYER_CHILD_CROWN_SIZE: number = 6; // Size of the crown for player's children
export const PLAYER_PARENT_CROWN_SIZE: number = 10; // Size of the crown for player's parents
export const PLAYER_PARTNER_CROWN_SIZE: number = 10; // Size of the crown for player's partner

// Visual Effects Constants
export const EFFECT_DURATION_SHORT_HOURS: number = 1;
export const EFFECT_DURATION_MEDIUM_HOURS: number = 3;
export const EFFECT_DURATION_LONG_HOURS: number = 6;
export const HUNGER_EFFECT_THRESHOLD: number = 70;
