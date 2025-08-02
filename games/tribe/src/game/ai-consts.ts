// AI and Behavior Tree Constants

// Human AI Constants
export const AI_UPDATE_INTERVAL = 1; // In game time
export const HUMAN_AI_HUNGER_THRESHOLD_FOR_EATING: number = 150 * 0.6; // AI decides to eat if hunger >= this and has food
export const HUMAN_AI_HUNGER_THRESHOLD_FOR_GATHERING: number = 150 * 0.25; // AI decides to gather if hunger >= this
export const HUMAN_AI_HUNGER_THRESHOLD_FOR_PLANTING = 150 * 0.7; // AI decides to plant if hunger >= this
export const HUMAN_AI_HUNGER_THRESHOLD_FOR_ATTACKING: number = 150 * 0.8; // AI decides to attack if hunger >= this
export const HUMAN_CRITICAL_HUNGER_FOR_STEALING: number = 80; // Hunger level that overrides some safeguards
export const AI_HUNTING_HUNGER_THRESHOLD = 80; // Hunger level to consider hunting prey
export const AI_HUNTING_FOOD_SEARCH_RADIUS = 300; // Radius to search for other food before hunting
export const AI_HUNTING_MAX_CHASE_DISTANCE_FROM_CENTER = 600; // Max distance from tribe center to chase prey
export const AI_DEFEND_BUSH_PREY_SEARCH_RADIUS = 150; // Radius to search for prey on claimed bushes
export const HUMAN_AI_IDLE_WONDER_CHANCE: number = 0.1; // Chance (0-1) to wander when idle
export const HUMAN_AI_IDle_WANDER_COOLDOWN = 10;
export const HUMAN_AI_WANDER_RADIUS: number = 150; // Max radius for wandering
export const CHILD_MAX_WANDER_DISTANCE_FROM_PARENT: number = 100;
export const FEMALE_PARTNER_MAX_WANDER_DISTANCE_FROM_MALE_PARTNER: number = 100;
export const FATHER_FOLLOW_DISTANCE = 150;
export const FATHER_FOLLOW_STOP_DISTANCE = 100;
export const HEIR_FOLLOW_STOP_DISTANCE = 150;
export const LEADER_FOLLOW_RADIUS = 250; // Radius within which followers will try to stay close to their leader
export const FOLLOW_LEADER_MIN_HUNGER_THRESHOLD = 120; // Followers will stop following if hunger is above this
export const PROCREATION_MIN_NEARBY_BERRY_BUSHES: number = 2; // Minimum number of berry bushes needed nearby for AI to consider procreation
export const PROCREATION_FOOD_SEARCH_RADIUS: number = 400; // Radius in pixels to search for food sources when considering procreation
export const PROCREATION_PARTNER_SEARCH_RADIUS_LONG: number = 1000;
export const AI_ATTACK_HUNGER_THRESHOLD: number = 150 * 0.85;
export const AI_DEFEND_CLAIMED_BUSH_RANGE: number = 100; // Range to defend claimed bush
export const AI_ATTACK_ENEMY_RANGE = 200; // Range in pixels for AI to attack an enemy
export const AI_DEFEND_BUSH_RANGE = 80; // Range in pixels for AI to defend a claimed bush
export const AI_TRIBE_BATTLE_RADIUS = 100; // Radius for tribe members to engage in battle around their leader
export const MAX_TRIBE_ATTACKERS_PER_TARGET = 3; // Maximum number of tribe members that should ideally attack a single target
export const ESTABLISH_TERRITORY_MOVEMENT_TIMEOUT_HOURS = 96;

export const BLACKBOARD_ENTRY_MAX_AGE_HOURS = 24; // Time in game hours to keep BT node history
export const ADULT_MALE_FAMILY_DISTANCE_RADIUS = 600; // Min distance an adult male with family tries to keep from his parents
export const TRIBE_CENTER_MAX_WANDER_DISTANCE = 500; // Max distance a tribe member will wander from the tribe's center
export const FAMILY_CENTER_MAX_WANDER_DISTANCE = 250; // Max distance a family member will wander from the family's center
export const ATTACK_CHASE_MAX_DISTANCE_FROM_CENTER = 600; // Max distance a human will chase an enemy from their home center

// Behavior Tree Cooldowns
export const BT_PROCREATION_SEARCH_COOLDOWN_HOURS = 1; // Cooldown for searching for a procreation partner
export const BT_ESTABLISH_TERRITORY_COOLDOWN_HOURS = 24; // Cooldown for attempting to establish a new territory
export const BT_PLANTING_SEARCH_COOLDOWN_HOURS = 1; // Cooldown for searching for a planting spot
export const BT_GATHERING_SEARCH_COOLDOWN_HOURS = 0.5; // Cooldown for searching for a food source

export const BT_HUNTING_PREY_SEARCH_COOLDOWN_HOURS = 2; // Cooldown for searching for prey
export const BT_DEFEND_BUSH_COOLDOWN_HOURS = 1; // Cooldown for the defend bush behavior
// Behavior Tree Decorator Node Constants
export const BT_ACTION_TIMEOUT_HOURS = 24; // Timeout for actions to prevent getting stuck
export const BT_EXPENSIVE_OPERATION_CACHE_HOURS = 12; // Cache duration for expensive checks

// Leader Meta AI Strategy Constants
export const LEADER_META_STRATEGY_COOLDOWN_HOURS = 10; // How often the leader re-evaluates the grand strategy
export const AI_DIPLOMACY_CHECK_INTERVAL_HOURS = 24; // How often the AI leader re-evaluates diplomacy
export const AI_MIGRATION_CHECK_INTERVAL_HOURS = 24;
export const AI_MIGRATION_TARGET_SEARCH_RADIUS = 1500;
export const LEADER_WORLD_ANALYSIS_GRID_SIZE = 500; // The size of each cell in the world analysis grid
export const LEADER_WORLD_ANALYSIS_GRID_STEP = 400; // The distance between the centers of each cell
export const LEADER_HABITAT_SCORE_BUSH_WEIGHT = 10; // Points for each bush in a region
export const LEADER_HABITAT_SCORE_DANGER_WEIGHT = -5; // Points against for each enemy/dangerous entity in a region
export const LEADER_MIGRATION_SUPERIORITY_THRESHOLD = 1.5; // How much better a new habitat must be to consider moving
export const LEADER_AGGRESSION_TRIBE_STRENGTH_ADVANTAGE_THRESHOLD = 1.5; // How much stronger our tribe must be to consider attacking another for their habitat
export const LEADER_COMBAT_STRENGTH_ADVANTAGE_THRESHOLD = 1.2;

export const LEADER_BT_CALL_TO_ATTACK_COOLDOWN_HOURS = 10;

// Social AI Constants
export const AI_JEALOUSY_PROCREATION_TRIGGER_RADIUS = 150; // Radius to detect partner procreating with another
export const AI_DEFEND_FAMILY_TRIGGER_RADIUS = 200; // Radius for a human to detect a family member being attacked
export const AI_DEFEND_CLAIMED_BUSH_TRIGGER_RADIUS = 100; // Radius for a human to notice an intruder on a claimed bush
export const AI_DESPERATE_ATTACK_HUNGER_THRESHOLD = 100; // Hunger level (out of 150) to trigger a desperate attack
export const AI_DESPERATE_ATTACK_TARGET_MAX_HP_PERCENT = 0.7; // Max HP % of a potential target to be considered weak enough for a desperate attack
export const AI_DESPERATE_ATTACK_SEARCH_RADIUS = 300; // Radius to search for a weak target
export const AI_PROCREATION_AVOID_PARTNER_PROXIMITY = 100; // If a potential mate's primary partner is within this radius, avoid procreating
export const AI_GATHERING_AVOID_OWNER_PROXIMITY = 120; // If the owner of a claimed bush is within this radius, avoid gathering
export const AI_GATHERING_SEARCH_RADIUS = 400; // Radius for AI to search for food sources

// AI Fleeing Constants
export const AI_FLEE_HEALTH_THRESHOLD = 0.15; // representing 15% of max health
export const AI_FLEE_DISTANCE = 200;

// Player Action Constants (AI related)
export const AUTOPILOT_ACTION_PROXIMITY = 30 * 0.75 * 1.2; // HUMAN_INTERACTION_PROXIMITY * 1.2
export const AUTOPILOT_MOVE_DISTANCE_THRESHOLD = 20;

// LLM Autopilot
export const LLM_AUTOPILOT_COOLDOWN_HOURS = 1; // Cooldown in game hours for LLM Autopilot decisions