// Human Constants

export const HUMAN_YEAR_IN_REAL_SECONDS: number = 10;
export const HUMAN_MAX_AGE_YEARS: number = 80; // Maximum lifespan in game years
export const MAX_ANCESTORS_TO_TRACK: number = 3;
export const HUMAN_HUNGER_INCREASE_PER_HOUR: number = 5; // Hunger increase rate
export const HUMAN_HUNGER_DEATH: number = 150; // Hunger level that causes death
export const HUMAN_HUNGER_THRESHOLD_SLOW: number = HUMAN_HUNGER_DEATH * 0.8; // Hunger level that triggers speed reduction
export const HUMAN_HUNGER_THRESHOLD_TUTORIAL: number = HUMAN_HUNGER_DEATH * 0.2; // Hunger level that triggers the tutorial
export const HUMAN_HUNGER_THRESHOLD_CRITICAL: number = HUMAN_HUNGER_DEATH * 0.8; // Hunger level that prevents procreation
export const HUMAN_FOOD_HUNGER_REDUCTION: number = 30; // How much hunger is reduced by eating food
export const HUMAN_MAX_FOOD: number = 10; // Maximum food a human can carry
export const HUMAN_BASE_SPEED: number = 10; // Base movement speed in pixels per second
export const HUMAN_SLOW_SPEED_MODIFIER: number = 0.5; // Speed modifier when hunger > threshold
export const HUMAN_INTERACTION_RANGE: number = 30; // Range in pixels for interactions
export const HUMAN_INTERACTION_PROXIMITY = HUMAN_INTERACTION_RANGE * 0.75; // Proximity for interactions (75% of interaction range)
export const HUMAN_CHOPPING_RANGE: number = 30; // Range in pixels for chopping interaction
export const HUMAN_CHOPPING_PROXIMITY = HUMAN_CHOPPING_RANGE * 0.75; // Proximity for chopping interaction
export const HUMAN_INITIAL_HUNGER: number = 50; // Initial hunger level for new humans
export const HUMAN_INITIAL_AGE: number = 20; // Initial age in years for new humans
export const HUMAN_OLD_AGE_FOR_SPEED_REDUCTION_THRESHOLD: number = HUMAN_MAX_AGE_YEARS * 0.8; // Age at which humans start moving slower (80% of max age)
export const HUMAN_OLD_AGE_SPEED_MODIFIER: number = 0.7; // Speed modifier for old age (e.g., 0.7 for 70% speed)

// Human Procreation Constants
export const HUMAN_MIN_PROCREATION_AGE: number = 16; // Minimum age for procreation
export const HUMAN_FEMALE_MAX_PROCREATION_AGE: number = 40; // Maximum age for a female to be able to procreate
export const PROCREATION_WANDER_BEFORE_NO_HEIR_HOURS: number = 24; // 1 game day
export const CHILD_TO_ADULT_AGE: number = 16; // Age at which a child becomes an adult
export const HUMAN_GESTATION_PERIOD_HOURS: number = 72 / 3; // 3 game days
export const HUMAN_PROCREATION_COOLDOWN_HOURS: number = 24; // 1 game day
export const HUMAN_PREGNANCY_HUNGER_INCREASE_RATE_MODIFIER: number = 1.25; // Hunger increases 25% faster during pregnancy
export const CHILD_HUNGER_INCREASE_RATE_MODIFIER: number = 1.5; // Hunger increases 50% faster for children
export const CHILD_HUNGER_THRESHOLD_FOR_REQUESTING_FOOD: number = HUMAN_HUNGER_DEATH * 0.6; // Hunger level for child to request food from parent
export const PARENT_FEEDING_RANGE: number = 50; // Range in pixels for parent to feed child
export const PARENT_FEED_CHILD_COOLDOWN_HOURS: number = 1; // Cooldown in game hours for a parent after feeding a child
export const CHILD_FOOD_SEEK_PARENT_SEARCH_RADIUS: number = 350; // Radius in pixels for a hungry child to search for a parent with food

// Constants for Adult Children Feeding Old Parents
export const HUMAN_OLD_AGE_THRESHOLD: number = HUMAN_MAX_AGE_YEARS * 0.65; // Age at which a human is considered 'old' for receiving care
export const HUMAN_OLD_PARENT_HUNGER_THRESHOLD_FOR_FEEDING: number = 80; // Hunger level for an old parent to be fed by an adult child
export const ADULT_CHILD_FEEDING_RANGE: number = 50; // Range in pixels for an adult child to feed an old parent
export const ADULT_CHILD_FEED_PARENT_COOLDOWN_HOURS: number = 1; // Cooldown in game hours for an adult child after feeding a parent

// Human Corpse Constants
export const HUMAN_CORPSE_DECAY_TIME_HOURS: number = 128;
export const HUMAN_CORPSE_INITIAL_FOOD: number = 10; // Initial food amount on a fresh corpse

// Human Attack Constants
export const HUMAN_MAX_HITPOINTS = 100;
export const HUMAN_ATTACK_MELEE_DAMAGE = 35;
export const HUMAN_ATTACK_MELEE_RANGE = 30; // Range in pixels for attack interaction
export const HUMAN_ATTACK_MELEE_BUILDUP_HOURS: number = 0.5; // Time in game hours for attack to build up
export const HUMAN_ATTACK_MELEE_COOLDOWN_HOURS: number = 2.5; // Cooldown in game hours for a human after attacking
export const HUMAN_ATTACK_RANGED_DAMAGE = 20;
export const HUMAN_ATTACK_RANGED_RANGE = 250;
export const HUMAN_ATTACK_RANGED_BUILDUP_HOURS: number = 0.4;
export const HUMAN_ATTACK_STONE_SPEED = 150; // pixels per game hour
export const HUMAN_ATTACK_RANGED_COOLDOWN_HOURS: number = 6; // Cooldown in game hours for a human after ranged attack
export const HUMAN_ATTACK_PUSHBACK_FORCE: number = 5; // Force applied to target on successful attack
export const HUMAN_ATTACK_RANGED_PUSHBACK_FORCE = 2;
export const HUMAN_ATTACK_MOVEMENT_SLOWDOWN_MODIFIER = 0.5; // 50% speed reduction
export const HUMAN_ATTACK_MOVEMENT_SLOWDOWN_DURATION_HOURS = 1.5; // in game hours
export const HUMAN_BASE_HITPOINT_REGEN_PER_HOUR = 0.1;
export const HITPOINT_REGEN_HUNGER_MODIFIER = 0.5; // Regeneration is 50% slower at max hunger
export const HUMAN_MALE_DAMAGE_MODIFIER = 1.5;
export const HUMAN_CHILD_DAMAGE_MODIFIER = 0.25;
export const HUMAN_VULNERABLE_DAMAGE_MODIFIER = 2.5;
export const HUMAN_PARRY_ANGLE_DEGREES = 45; // Angle in degrees for a successful parry
export const HUMAN_PARRY_CHANCE = 0.05; // Chance (0-1) to parry if angle is correct

// Supply Chain Constants
export const SUPPLY_PROXIMITY_THRESHOLD: number = 200; // Distance in pixels at which demanders start engaging with approaching suppliers
