// Game Constants

export const HOURS_PER_GAME_DAY: number = 24;
export const GAME_DAY_IN_REAL_SECONDS: number = 10; // World and Movement Constants

// Time Constants
export const MAP_WIDTH: number = 3000; // pixels
export const MAP_HEIGHT: number = 3000; // pixels
export const VIEWPORT_FOLLOW_SPEED = 2.0;

// Berry Bush Constants
export const BERRY_BUSH_MAX_FOOD: number = 5;
export const BERRY_BUSH_INITIAL_FOOD: number = 3;
export const BERRY_BUSH_REGENERATION_HOURS: number = 12; // Hours for 1 food to grow
export const BERRY_BUSH_LIFESPAN_GAME_HOURS: number = 940;
export const BERRY_BUSH_SPREAD_CHANCE: number = 0.7;
export const BERRY_BUSH_SPREAD_RADIUS: number = 20; // pixels
export const BERRY_BUSH_SPREAD_COOLDOWN_HOURS: number = 90;
export const INITIAL_BERRY_BUSH_COUNT: number = 45;
export const BERRY_BUSH_CLAIM_DURATION_HOURS: number = 240; // This constant represents the duration in game hours for which a human's claim on a berry bush remains active.

// Human Constants
export const HUMAN_YEAR_IN_REAL_SECONDS: number = 10;
export const HUMAN_MAX_AGE_YEARS: number = 80; // Maximum lifespan in game years
export const MAX_ANCESTORS_TO_TRACK: number = 3;
export const HUMAN_HUNGER_INCREASE_PER_HOUR: number = 5; // Hunger increase rate
export const HUMAN_HUNGER_DEATH: number = 150; // Hunger level that causes death
export const HUMAN_HUNGER_THRESHOLD_SLOW: number = HUMAN_HUNGER_DEATH * 0.8; // Hunger level that triggers speed reduction
export const HUMAN_HUNGER_THRESHOLD_TUTORIAL: number = HUMAN_HUNGER_DEATH * 0.2; // Hunger level that triggers the tutorial
export const HUMAN_HUNGER_THRESHOLD_CRITICAL: number = HUMAN_HUNGER_DEATH * 0.95; // Hunger level that prevents procreation
export const HUMAN_FOOD_HUNGER_REDUCTION: number = 30; // How much hunger is reduced by eating food
export const HUMAN_MAX_FOOD: number = 10; // Maximum food a human can carry
export const HUMAN_BASE_SPEED: number = 10; // Base movement speed in pixels per second
export const HUMAN_SLOW_SPEED_MODIFIER: number = 0.5; // Speed modifier when hunger > threshold
export const HUMAN_INTERACTION_RANGE: number = 30; // Range in pixels for interactions
export const HUMAN_INTERACTION_PROXIMITY = HUMAN_INTERACTION_RANGE * 0.75; // Proximity for interactions (75% of interaction range)
export const HUMAN_INITIAL_HUNGER: number = 50; // Initial hunger level for new humans
export const HUMAN_INITIAL_AGE: number = 20; // Initial age in years for new humans
export const HUMAN_OLD_AGE_FOR_SPEED_REDUCTION_THRESHOLD: number = HUMAN_MAX_AGE_YEARS * 0.8; // Age at which humans start moving slower (80% of max age)
export const HUMAN_OLD_AGE_SPEED_MODIFIER: number = 0.7; // Speed modifier for old age (e.g., 0.7 for 70% speed)

// Human Procreation Constants
export const HUMAN_MIN_PROCREATION_AGE: number = 16; // Minimum age for procreation
export const HUMAN_FEMALE_MAX_PROCREATION_AGE: number = 40; // Maximum age for a female to be able to procreate
export const HUMAN_MALE_URGENT_PROCREATION_AGE: number = 35; // Age at which male without heir urgently seeks procreation
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
export const HUMAN_ATTACK_DAMAGE = 35;
export const HUMAN_ATTACK_RANGE: number = HUMAN_INTERACTION_RANGE; // Range in pixels for attack interaction
export const HUMAN_ATTACK_BUILDUP_HOURS: number = 0.5; // Time in game hours for attack to build up
export const HUMAN_ATTACK_COOLDOWN_HOURS: number = 2.5; // Cooldown in game hours for a human after attacking
export const HUMAN_ATTACK_PUSHBACK_FORCE: number = 5; // Force applied to target on successful attack
export const HUMAN_ATTACK_MOVEMENT_SLOWDOWN_MODIFIER = 0.5; // 50% speed reduction
export const HUMAN_ATTACK_MOVEMENT_SLOWDOWN_DURATION_HOURS = 1.5; // in game hours
export const HUMAN_BASE_HITPOINT_REGEN_PER_HOUR = 0.1;
export const HITPOINT_REGEN_HUNGER_MODIFIER = 0.5; // Regeneration is 50% slower at max hunger
export const HUMAN_MALE_DAMAGE_MODIFIER = 1.5;
export const HUMAN_CHILD_DAMAGE_MODIFIER = 0.25;
export const HUMAN_VULNERABLE_DAMAGE_MODIFIER = 2.5;
export const HUMAN_PARRY_ANGLE_DEGREES = 45; // Angle in degrees for a successful parry
export const HUMAN_PARRY_CHANCE = 0.05; // Chance (0-1) to parry if angle is correct
export const MAX_ATTACKERS_PER_TARGET = 1; // Maximum number of humans that should ideally attack a single target

// Human Planting Constants
export const MAX_BUSHES_PER_TRIBE_TERRITORY = 10;
export const BERRY_COST_FOR_PLANTING = 5;
export const HUMAN_PLANTING_DURATION_HOURS = 0.5; // Time in game hours for planting action
export const AI_PLANTING_BERRY_THRESHOLD = 6; // Min berries for AI to consider planting
export const AI_PLANTING_SEARCH_RADIUS = 100; // Radius for AI to search for a planting spot
export const AI_PLANTING_CHECK_RADIUS = 300; // Radius for AI to check if bushes are already planted
export const BERRY_BUSH_PLANTING_CLEARANCE_RADIUS = 30;

// Human AI Constants
export const AI_UPDATE_INTERVAL = 1; // In game time
export const HUMAN_AI_HUNGER_THRESHOLD_FOR_EATING: number = HUMAN_HUNGER_DEATH * 0.6; // AI decides to eat if hunger >= this and has food
export const HUMAN_AI_HUNGER_THRESHOLD_FOR_GATHERING: number = HUMAN_HUNGER_DEATH * 0.25; // AI decides to gather if hunger >= this
export const HUMAN_AI_HUNGER_THRESHOLD_FOR_PLANTING = HUMAN_HUNGER_DEATH * 0.7; // AI decides to plant if hunger >= this
export const HUMAN_AI_HUNGER_THRESHOLD_FOR_ATTACKING: number = HUMAN_HUNGER_DEATH * 0.8; // AI decides to attack if hunger >= this
export const HUMAN_CRITICAL_HUNGER_FOR_STEALING: number = 80; // Hunger level that overrides some safeguards
export const HUMAN_AI_IDLE_WANDER_CHANCE: number = 0.1; // Chance (0-1) to wander when idle
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
export const AI_ATTACK_HUNGER_THRESHOLD: number = HUMAN_HUNGER_DEATH * 0.85;
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

// Behavior Tree Decorator Node Constants
export const BT_ACTION_TIMEOUT_HOURS = 24; // Timeout for actions to prevent getting stuck
export const BT_EXPENSIVE_OPERATION_CACHE_HOURS = 12; // Cache duration for expensive checks

// Tribe Split Constants
export const TRIBE_SPLIT_MIN_TRIBE_HEADCOUNT = 40;
export const TRIBE_SPLIT_MIN_FAMILY_HEADCOUNT_PERCENTAGE = 0.3;
export const TRIBE_SPLIT_CHECK_INTERVAL_HOURS = 24;
export const TRIBE_SPLIT_MOVE_AWAY_DISTANCE = 500;

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
// Human AI Fleeing Constants

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

// Player Action Constants
export const PLAYER_CALL_TO_ATTACK_DURATION_HOURS: number = 10;
export const PLAYER_CALL_TO_ATTACK_RADIUS: number = 250;
export const PLAYER_CALL_TO_FOLLOW_DURATION_HOURS: number = 12;
export const PLAYER_CALL_TO_FOLLOW_RADIUS: number = 300;
export const PLAYER_TRIBE_SPLIT_COOLDOWN_HOURS = 9999;
export const AUTOPILOT_ACTION_PROXIMITY = HUMAN_INTERACTION_PROXIMITY * 1.2;
export const FAST_FORWARD_AMOUNT_SECONDS = 10;
export const AUTOPILOT_MOVE_DISTANCE_THRESHOLD = 20;
export const AI_FLEE_HEALTH_THRESHOLD = 0.15; // representing 15% of max health
export const AI_FLEE_DISTANCE = 200;

// Rendering Constants
export const CHARACTER_RADIUS = 30;
export const CHARACTER_CHILD_RADIUS = CHARACTER_RADIUS * 0.6; // Smaller radius for child characters

// Highlight Colors
export const PLAYER_HIGHLIGHT_COLOR: string = '#4CAF50'; // Green
export const PLAYER_PARENT_HIGHLIGHT_COLOR: string = '#FF5722'; // Deep Orange
export const PLAYER_PARTNER_HIGHLIGHT_COLOR: string = '#9C27B0'; // Purple
export const PLAYER_CHILD_HIGHLIGHT_COLOR: string = '#2196F3'; // Blue
export const PLAYER_HEIR_HIGHLIGHT_COLOR: string = '#FFC107'; // Amber/Gold
export const FAMILY_CLAIM_COLOR: string = '#FFD700'; // Gold
export const NON_FAMILY_CLAIM_COLOR: string = '#DC143C'; // Crimson
export const PLAYER_ACTION_OUTLINE_COLOR: string = '#FFFFFF';
export const PLAYER_ACTION_OUTLINE_DASH_PATTERN: number[] = [5, 5];
export const PLAYER_ACTION_OUTLINE_RADIUS_OFFSET: number = 5;
export const PLAYER_ACTION_HINT_FONT_SIZE: number = 15;

// Crown Sizes
export const PLAYER_CROWN_SIZE: number = 20; // Size of the crown for player character
export const PLAYER_HEIR_CROWN_SIZE: number = 16; // Size of the crown for player's heir
export const PLAYER_CHILD_CROWN_SIZE: number = 10; // Size of the crown for player's children
export const PLAYER_PARENT_CROWN_SIZE: number = 16; // Size of the crown for player's parents
export const PLAYER_PARTNER_CROWN_SIZE: number = 16; // Size of the crown for player's partner
export const TRIBE_BADGE_EMOJIS = ['👑', '💀', '🔥', '💧', '☘️', '☀️', '🌙', '⭐', '⚡', '⚜️'];
export const TRIBE_BADGE_SIZE: number = 8;

// UI Constants
export const UI_TEXT_COLOR: string = '#FFFFFF';
export const UI_FONT_SIZE: number = 18;
export const UI_PADDING: number = 15;
export const UI_TEXT_SHADOW_COLOR: string = 'rgba(0, 0, 0, 0.7)';
export const UI_TEXT_SHADOW_BLUR: number = 4;

// UI Bar Constants
export const UI_BAR_WIDTH = 150;
export const UI_BAR_HEIGHT = 15;
export const UI_BAR_PADDING = 10;
export const UI_BAR_BACKGROUND_COLOR = '#555';
export const UI_HUNGER_BAR_COLOR = '#f44336';
export const UI_HITPOINTS_BAR_COLOR = '#4CAF50'; // Green for health
export const UI_AGE_BAR_COLOR = '#2196F3';
export const UI_TIME_BAR_COLOR = '#FFC107';
export const UI_BERRY_ICON_SIZE = 16;
export const CORPSE_MEAT_ICON_SIZE = 9;
export const UI_MINIATURE_CHARACTER_SIZE = 32;
export const UI_FAMILY_MEMBER_ICON_SIZE = 28;
export const UI_MINIATURE_PLAYER_CROWN_SIZE = 10;
export const UI_MINIATURE_HEIR_CROWN_SIZE = 8;
export const UI_MINIATURE_PARTNER_CROWN_SIZE = 8;
export const UI_MINIATURE_PARENT_CROWN_SIZE = 8;

// UI Tribe List Constants
export const UI_TRIBE_LIST_BADGE_SIZE = 28;
export const UI_TRIBE_LIST_ITEM_HEIGHT = 40;
export const UI_TRIBE_LIST_HIGHLIGHT_COLOR = 'rgba(255, 215, 0, 0.7)'; // Gold with alpha
export const UI_TRIBE_LIST_BACKGROUND_COLOR = 'rgba(0, 0, 0, 0.3)';
export const UI_TRIBE_LIST_PADDING = 10;
export const UI_TRIBE_LIST_SPACING = 8;
export const UI_TRIBE_LIST_COUNT_FONT_SIZE = 11;
export const UI_TRIBE_LIST_MINIATURE_SIZE = 20;

// UI Attack Progress Bar Constants
export const UI_ATTACK_PROGRESS_BAR_WIDTH = 40;
export const UI_ATTACK_PROGRESS_BAR_HEIGHT = 5;
export const UI_ATTACK_PROGRESS_BAR_Y_OFFSET = 10;
export const UI_ATTACK_BUILDUP_BAR_COLOR = '#FFA500'; // Orange
export const UI_ATTACK_COOLDOWN_BAR_COLOR = '#808080'; // Gray

// UI Button Constants
export const UI_BUTTON_WIDTH: number = 120;
export const UI_BUTTON_HEIGHT: number = 30;
export const UI_BUTTON_SPACING: number = 20;
export const UI_BUTTON_BACKGROUND_COLOR: string = '#2d3748';
export const UI_BUTTON_TEXT_COLOR: string = '#ffffff';
export const UI_BUTTON_ACTIVE_BACKGROUND_COLOR: string = '#4a5568';
export const UI_BUTTON_BORDER_RADIUS = 5;
export const UI_BUTTON_HOVER_BACKGROUND_COLOR: string = '#bdc9f792';
export const UI_BUTTON_DISABLED_BACKGROUND_COLOR: string = '#272c36ff'; // A bit lighter than active
export const UI_BUTTON_DISABLED_TEXT_COLOR: string = '#a0aec0'; // Grayed out text
export const UI_BUTTON_FLASH_DURATION_MS: number = 300; // 300ms flash
export const UI_BUTTON_FLASH_COLOR: string = 'rgba(255, 255, 255, 0.5)'; // White flash
export const UI_TOOLTIP_BACKGROUND_COLOR: string = 'rgba(0, 0, 0, 0.8)';
export const UI_TOOLTIP_TEXT_COLOR: string = '#FFFFFF';
export const UI_TOOLTIP_FONT_SIZE: number = 14;
export const UI_TOOLTIP_PADDING: number = 8;
export const UI_TOOLTIP_OFFSET_Y: number = -15;
export const UI_BUTTON_ACTIVATED_BORDER_COLOR: string = '#FFD700'; // Gold
export const UI_BUTTON_ACTIVATED_PULSE_SPEED: number = 5;

// Behavior Tree Debug UI Constants
export const UI_BT_DEBUG_X_OFFSET = 60;
export const UI_BT_DEBUG_Y_OFFSET = -50;
export const UI_BT_DEBUG_FONT_SIZE = 10;
export const UI_BT_DEBUG_LINE_HEIGHT = 12;
export const UI_BT_DEBUG_INDENT_SIZE = 10;
export const UI_BT_DEBUG_BACKGROUND_COLOR = 'rgba(0, 0, 0, 0.5)';
export const UI_BT_DEBUG_STATUS_SUCCESS_COLOR = '#4CAF50';
export const UI_BT_DEBUG_STATUS_FAILURE_COLOR = '#F44336';
export const UI_BT_DEBUG_STATUS_RUNNING_COLOR = '#FFC107';
export const UI_BT_DEBUG_STATUS_NOT_EVALUATED_COLOR = 'rgba(255, 255, 255, 0.2)';
export const UI_BT_DEBUG_HEATMAP_COLD_COLOR = '#FFFFFF';
export const UI_BT_DEBUG_HEATMAP_HOT_COLOR = '#FF6B6B';
export const UI_BT_DEBUG_HEATMAP_DECAY_TIME_SECONDS = 5;
export const UI_BT_DEBUG_HISTOGRAM_WINDOW_SECONDS = 30;
export const UI_BT_DEBUG_HISTOGRAM_MAX_WIDTH = 50;
export const UI_BT_DEBUG_HISTOGRAM_BAR_HEIGHT = 8;
export const UI_BT_DEBUG_HISTOGRAM_X_OFFSET = 10;

// Pause UI Constants
export const UI_PAUSE_OVERLAY_COLOR: string = 'rgba(0, 0, 0, 0.5)';
export const UI_PAUSE_TEXT_COLOR: string = '#FFFFFF';
export const UI_PAUSE_FONT_SIZE: number = 33;

// UI Tutorial Constants
export const UI_TUTORIAL_PANEL_WIDTH: number = 400;
export const UI_TUTORIAL_PANEL_PADDING: number = 20;
export const UI_TUTORIAL_PANEL_BORDER_RADIUS: number = 10;
export const UI_TUTORIAL_PANEL_BACKGROUND_COLOR: string = 'rgba(0, 0, 0, 0.7)';
export const UI_TUTORIAL_PANEL_TEXT_COLOR: string = '#FFFFFF';
export const UI_TUTORIAL_TITLE_FONT_SIZE: number = 20;
export const UI_TUTORIAL_TEXT_FONT_SIZE: number = 16;
export const UI_TUTORIAL_TRANSITION_DURATION_SECONDS: number = 0.5; // seconds for fade in/out
export const UI_TUTORIAL_MIN_DISPLAY_TIME_SECONDS: number = 5; // seconds for minimum display time
export const UI_TUTORIAL_HIGHLIGHT_COLOR: string = '#FFD700'; // Gold
export const UI_TUTORIAL_HIGHLIGHT_RADIUS: number = 40;
export const UI_TUTORIAL_HIGHLIGHT_PULSE_SPEED: number = 4;
export const UI_TUTORIAL_HIGHLIGHT_LINE_WIDTH: number = 3;
export const UI_TUTORIAL_HIGHLIGHT_PADDING: number = 5;
export const UI_TUTORIAL_DISMISS_BUTTON_SIZE: number = 20;
export const UI_TUTORIAL_DISMISS_BUTTON_PADDING: number = 5;
export const UI_TUTORIAL_DISMISS_BUTTON_COLOR: string = '#FFFFFF';
export const UI_TUTORIAL_DISMISS_BUTTON_HOVER_COLOR: string = '#FF6B6B';

// Visual Effects Constants
export const EFFECT_DURATION_SHORT_HOURS: number = 1;
export const EFFECT_DURATION_MEDIUM_HOURS: number = 3;
export const HUNGER_EFFECT_THRESHOLD: number = 70;

// Sound Constants
export const SOUND_MAX_DISTANCE = 600;
export const SOUND_FALLOFF = 1.5;
export const INITIAL_MASTER_VOLUME = 0.1;

// Intro Screen Constants
export const INTRO_SCREEN_INITIAL_HUMANS: number = 15;
export const INTRO_SCREEN_VIEWPORT_SWITCH_INTERVAL_MS: number = 5000;

// LLM Autopilot
export const LLM_AUTOPILOT_COOLDOWN_HOURS = 1; // Cooldown in game hours for LLM Autopilot decisions

// LLM Autopilot UI Constants
export const UI_AUTOPILOT_BUTTON_SIZE = 80;
export const UI_AUTOPILOT_BUTTON_SPACING = 10;
export const UI_AUTOPILOT_BUTTON_FONT_SIZE = 14;

// Notification Constants
export const NOTIFICATION_DURATION_MEDIUM_HOURS: number = 12; // e.g., for starving children warning
export const NOTIFICATION_DURATION_LONG_HOURS: number = 24; // e.g., for new tribe formed
export const CHILD_HUNGER_THRESHOLD_FOR_NOTIFICATION: number = HUMAN_HUNGER_DEATH * 0.9; // At 90% hunger
export const NOTIFICATION_DISMISS_COOLDOWN_HOURS: number = 24; // Cooldown before a dismissed notification can reappear

// UI Notification Constants
export const UI_NOTIFICATION_PANEL_WIDTH: number = 300;
export const UI_NOTIFICATION_PANEL_PADDING: number = 15;
export const UI_NOTIFICATION_PANEL_BORDER_RADIUS: number = 8;
export const UI_NOTIFICATION_PANEL_BACKGROUND_COLOR: string = 'rgba(0, 0, 0, 0.8)';
export const UI_NOTIFICATION_TEXT_COLOR: string = '#FFFFFF';
export const UI_NOTIFICATION_TITLE_FONT_SIZE: number = 16;
export const UI_NOTIFICATION_TEXT_FONT_SIZE: number = 14;
export const UI_NOTIFICATION_SPACING: number = 10;
export const UI_NOTIFICATION_DISMISS_BUTTON_SIZE: number = 20;
export const UI_NOTIFICATION_DISMISS_BUTTON_COLOR: string = '#FF6B6B';
export const UI_NOTIFICATION_VIEW_BUTTON_COLOR: string = '#4CAF50';
export const UI_NOTIFICATION_BUTTON_HOVER_COLOR: string = '#FFD700'; // Gold for hover
export const UI_NOTIFICATION_HIGHLIGHT_COLOR: string = 'rgba(255, 255, 0, 0.3)'; // Yellow highlight for entities/areas
export const UI_NOTIFICATION_HIGHLIGHT_PULSE_SPEED: number = 2;
export const UI_NOTIFICATION_SLIDE_IN_DURATION_MS = 500;
export const UI_NOTIFICATION_AREA_PADDING_BOTTOM = 120; // Pushes notifications above the bottom button row

export const UI_NOTIFICATION_ENTITY_HIGHLIGHT_RADIUS: number = 45;
export const UI_NOTIFICATION_ENTITY_HIGHLIGHT_COLOR: string = '#FFD700'; // Gold
export const UI_NOTIFICATION_ENTITY_HIGHLIGHT_PULSE_SPEED: number = 3;
export const UI_NOTIFICATION_ENTITY_HIGHLIGHT_LINE_WIDTH: number = 4;

// Prey Constants
export const PREY_MAX_AGE_YEARS: number = 12; // Maximum lifespan in game years
export const PREY_HUNGER_INCREASE_PER_HOUR: number = 8; // Faster hunger than humans
export const PREY_HUNGER_DEATH: number = 120; // Lower hunger threshold than humans
export const PREY_MAX_HITPOINTS: number = 50; // Lower health than humans
export const PREY_BASE_SPEED: number = 15; // Faster than humans
export const PREY_INITIAL_HUNGER: number = 30;
export const PREY_INITIAL_AGE: number = 2;
export const PREY_INTERACTION_RANGE: number = 25;
export const PREY_FLEE_DISTANCE: number = 150;
export const PREY_FLEE_SPEED_MODIFIER: number = 1.5; // 50% speed boost when fleeing
export const PREY_GESTATION_PERIOD_HOURS: number = 48; // 2 game days
export const PREY_PROCREATION_COOLDOWN_HOURS: number = 12; // Half game day
export const PREY_MIN_PROCREATION_AGE: number = 2;
export const PREY_MAX_PROCREATION_AGE: number = 8;
export const PREY_EATING_COOLDOWN_HOURS: number = 0.5;
export const PREY_BERRY_BUSH_DAMAGE: number = 1; // Reduces berry bush lifespan

// Predator Constants  
export const PREDATOR_MAX_AGE_YEARS: number = 20; // Longer lifespan than prey
export const PREDATOR_HUNGER_INCREASE_PER_HOUR: number = 6; // Between humans and prey
export const PREDATOR_HUNGER_DEATH: number = 140; // Higher than prey, lower than humans
export const PREDATOR_MAX_HITPOINTS: number = 80; // Between prey and humans
export const PREDATOR_BASE_SPEED: number = 12; // Slightly faster than humans
export const PREDATOR_INITIAL_HUNGER: number = 40;
export const PREDATOR_INITIAL_AGE: number = 3;
export const PREDATOR_INTERACTION_RANGE: number = 35;
export const PREDATOR_ATTACK_RANGE: number = 40;
export const PREDATOR_HUNT_RANGE: number = 50;
export const PREDATOR_TERRITORIAL_RANGE: number = 120; // Range for detecting territorial rivals
export const PREDATOR_ATTACK_DAMAGE: number = 45; // Higher than human attack
export const PREDATOR_HUNT_DAMAGE: number = 60; // Even higher for hunting prey
export const PREDATOR_ATTACK_COOLDOWN_HOURS: number = 2;
export const PREDATOR_HUNT_COOLDOWN_HOURS: number = 1.5;
export const PREDATOR_GESTATION_PERIOD_HOURS: number = 60; // 2.5 game days
export const PREDATOR_PROCREATION_COOLDOWN_HOURS: number = 18;
export const PREDATOR_MIN_PROCREATION_AGE: number = 3;
export const PREDATOR_MAX_PROCREATION_AGE: number = 15;
export const PREDATOR_MEAT_HUNGER_REDUCTION: number = 50; // How much hunger is reduced by eating meat

// Animal Spawning Constants
export const INITIAL_PREY_COUNT: number = 8;
export const INITIAL_PREDATOR_COUNT: number = 2;
