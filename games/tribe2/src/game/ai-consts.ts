// AI and Behavior Tree Constants

import { MAP_WIDTH } from './game-consts';

// Human AI Constants
export const AI_UPDATE_INTERVAL = 1; // In game time
export const HUMAN_AI_HUNGER_THRESHOLD_FOR_EATING: number = 150 * 0.6; // AI decides to eat if hunger >= this and has food
export const HUMAN_AI_HUNGER_THRESHOLD_FOR_GATHERING: number = 150 * 0.15; // AI decides to gather if hunger >= this (lowered from 0.25 to prevent starvation)
export const HUMAN_AI_HUNGER_THRESHOLD_FOR_PLANTING = 150 * 0.7; // AI decides to plant if hunger >= this
export const HUMAN_AI_HUNGER_THRESHOLD_FOR_ATTACKING: number = 150 * 0.8; // AI decides to attack if hunger >= this
export const AI_HUNTING_FOOD_SEARCH_RADIUS = 400; // Radius to search for other food before hunting
export const AI_HUNTING_MAX_CHASE_DISTANCE_FROM_CENTER = 800; // Max distance from tribe center to chase prey
export const HUMAN_AI_WANDER_RADIUS: number = 150; // Max radius for wandering
export const FATHER_FOLLOW_STOP_DISTANCE = 300;
export const PROCREATION_MIN_NEARBY_BERRY_BUSHES: number = 1; // Minimum number of berry bushes needed nearby for AI to consider procreation (lowered from 2 to improve survival)
export const PROCREATION_FOOD_SEARCH_RADIUS: number = 800; // Radius in pixels to search for food sources when considering procreation
export const PROCREATION_PARTNER_SEARCH_RADIUS_LONG: number = 500;
export const AI_ATTACK_HUNGER_THRESHOLD: number = 150 * 0.85;
export const AI_TRIBE_BATTLE_RADIUS = 100; // Radius for tribe members to engage in battle around their leader
export const MAX_TRIBE_ATTACKERS_PER_TARGET = 3; // Maximum number of tribe members that should ideally attack a single target

export const BLACKBOARD_ENTRY_MAX_AGE_HOURS = 24; // Time in game hours to keep BT node history
export const ATTACK_CHASE_MAX_DISTANCE_FROM_CENTER = 600; // Max distance a human will chase an enemy from their home center

// Behavior Tree Cooldowns
export const BT_PROCREATION_SEARCH_COOLDOWN_HOURS = 1; // Cooldown for searching for a procreation partner
export const BT_PLANTING_SEARCH_COOLDOWN_HOURS = 1; // Cooldown for searching for a planting spot
export const BT_GATHERING_SEARCH_COOLDOWN_HOURS = 0.5; // Cooldown for searching for a food source

export const BT_HUNTING_PREY_SEARCH_COOLDOWN_HOURS = 2; // Cooldown for searching for prey
// Behavior Tree Decorator Node Constants
export const BT_ACTION_TIMEOUT_HOURS = 24; // Timeout for actions to prevent getting stuck
export const BT_EXPENSIVE_OPERATION_CACHE_HOURS = 12; // Cache duration for expensive checks

// Leader Meta AI Strategy Constants
export const AI_DIPLOMACY_CHECK_INTERVAL_HOURS = 24; // How often the AI leader re-evaluates diplomacy
export const LEADER_AGGRESSION_TRIBE_STRENGTH_ADVANTAGE_THRESHOLD = 1.5; // How much stronger our tribe must be to consider attacking another for their habitat

// Social AI Constants
export const AI_JEALOUSY_PROCREATION_TRIGGER_RADIUS = 150; // Radius to detect partner procreating with another
export const AI_DEFEND_FAMILY_TRIGGER_RADIUS = 200; // Radius for a human to detect a family member being attacked
export const AI_DESPERATE_ATTACK_HUNGER_THRESHOLD = 100; // Hunger level (out of 150) to trigger a desperate attack
export const AI_DESPERATE_ATTACK_TARGET_MAX_HP_PERCENT = 0.7; // Max HP % of a potential target to be considered weak enough for a desperate attack
export const AI_DESPERATE_ATTACK_SEARCH_RADIUS = 300; // Radius to search for a weak target
export const AI_PROCREATION_AVOID_PARTNER_PROXIMITY = 100; // If a potential mate's primary partner is within this radius, avoid procreating
export const AI_GATHERING_SEARCH_RADIUS = 600; // Radius for AI to search for food sources

// AI Fleeing Constants
export const AI_FLEE_HEALTH_THRESHOLD = 0.15; // representing 15% of max health
export const AI_FLEE_DISTANCE = 200;

// Player Action Constants (AI related)
export const AUTOPILOT_ACTION_PROXIMITY = 30 * 0.75 * 1.2; // HUMAN_INTERACTION_PROXIMITY * 1.2
export const AUTOPILOT_MOVE_DISTANCE_THRESHOLD = 20;

// Food Security and Adaptive Behavior Constants
export const FOOD_SECURITY_EMERGENCY_THRESHOLD = 0.3; // Below this, tribe is in emergency mode
export const FOOD_SECURITY_GROWTH_THRESHOLD = 0.6; // Below this, tribe is in growth mode
export const FOOD_SECURITY_MAINTENANCE_THRESHOLD = 0.8; // Below this, tribe is in maintenance mode
// Above MAINTENANCE_THRESHOLD is abundance mode

export const BUSHES_PER_MEMBER_EMERGENCY = 1; // Minimal bush target during emergency
export const BUSHES_PER_MEMBER_GROWTH = 3; // Bush target during growth phase
export const BUSHES_PER_MEMBER_MAINTENANCE = 5; // Bush target during maintenance
export const BUSHES_PER_MEMBER_ABUNDANCE = 6; // Bush target during abundance

export const DEPOSIT_COOLDOWN_HOURS = 0.5; // Cooldown between deposits to prevent constant back-and-forth
export const DEPOSIT_THRESHOLD_LOW_STORAGE = 0.4; // Deposit when personal food > 40% if storage < 30%
export const DEPOSIT_THRESHOLD_MID_STORAGE = 0.6; // Deposit when personal food > 60% if storage 30-70%
export const DEPOSIT_THRESHOLD_HIGH_STORAGE = 0.8; // Deposit when personal food > 80% if storage > 70%

// Leader Building Placement Constants
export const BT_LEADER_BUILDING_PLACEMENT_COOLDOWN_HOURS = 2; // How often to check for building needs
export const LEADER_BUILDING_SPIRAL_SEARCH_RADIUS = MAP_WIDTH / 2; // Max distance to search for building placement
export const LEADER_BUILDING_MIN_TRIBE_SIZE = 2; // Minimum adult tribe members to consider building
export const LEADER_BUILDING_STORAGE_UTILIZATION_THRESHOLD = 0.7; // Build storage when 70% full
export const LEADER_BUILDING_MIN_BUSHES_PER_MEMBER = 0.5; // Build planting zone when below this ratio
export const LEADER_BUILDING_PROJECTED_TRIBE_GROWTH_RATE = 0.1; // Expected growth rate to factor into building decisions
export const LEADER_BUILDING_MIN_DISTANCE_FROM_OTHER_TRIBE_CENTER = 400; // Min distance from other tribes for buildings
export const LEADER_BUILDING_FIRST_STORAGE_MIN_DISTANCE_FROM_OTHER_TRIBE_CENTER = 800; // Min distance for first storage (base establishment)

// Building Placement Optimization Constants
export const BUILDING_PLACEMENT_MAX_ANCHORS = 8; // Maximum number of anchor points (buildings) to search from
export const BUILDING_PLACEMENT_SLOW_LOG_THRESHOLD_MS = 5; // Log searches that take longer than this (in milliseconds)
export const BUILDING_PLACEMENT_TRIG_CACHE_SIZE = 16; // Maximum number of angles to pre-compute for trig cache

// Leader Building Interaction Constants (Enemy Buildings)
export const LEADER_BUILDING_INTERACTION_CHECK_INTERVAL_HOURS = 5; // How often leaders check for enemy buildings to take over or destroy
export const LEADER_BUILDING_INTERACTION_RANGE = 600; // Detection range for finding enemy buildings

// Building Placement Proximity Constants
export const LEADER_BUILDING_PLACEMENT_PROXIMITY = 100; // Distance leader must be within to place buildings
export const BORDER_POST_PLACEMENT_PROXIMITY = 100; // Distance warrior/leader must be within to place border posts

// Border Post Quality Scoring Constants
export const BORDER_POST_OPTIMAL_SPACING = 200; // Ideal distance between border posts for good coverage
export const BORDER_POST_MAX_USEFUL_DISTANCE = 600; // Maximum useful distance from tribe center
export const BORDER_POST_REPLACEMENT_THRESHOLD = 20; // Score improvement needed to justify replacing a post (out of 100)
export const BORDER_POST_MIN_ISOLATION_DISTANCE = 100; // Minimum distance from other border posts
