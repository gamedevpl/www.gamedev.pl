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
export const BERRY_BUSH_SPREAD_CHANCE: number = 0.4;
export const BERRY_BUSH_SPREAD_RADIUS: number = 20; // pixels
export const BERRY_BUSH_SPREAD_COOLDOWN_HOURS: number = 160;
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
export const HUMAN_ATTACK_DAMAGE = 20;
export const HUMAN_ATTACK_RANGE: number = HUMAN_INTERACTION_RANGE; // Range in pixels for attack interaction
export const HUMAN_ATTACK_BUILDUP_HOURS: number = 0.5; // Time in game hours for attack to build up
export const HUMAN_ATTACK_COOLDOWN_HOURS: number = 5; // Cooldown in game hours for a human after attacking
export const HUMAN_ATTACK_PUSHBACK_FORCE: number = 5; // Force applied to target on successful attack
export const HUMAN_BASE_HITPOINT_REGEN_PER_HOUR = 0.1;
export const HITPOINT_REGEN_HUNGER_MODIFIER = 0.5; // Regeneration is 50% slower at max hunger
export const HUMAN_MALE_DAMAGE_MODIFIER = 1.5;
export const HUMAN_CHILD_DAMAGE_MODIFIER = 0.25;
export const HUMAN_VULNERABLE_DAMAGE_MODIFIER = 2.0;
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
export const AI_UPDATE_INTERVAL = 0.5; // In game time
export const HUMAN_AI_HUNGER_THRESHOLD_FOR_EATING: number = HUMAN_HUNGER_DEATH * 0.6; // AI decides to eat if hunger >= this and has food
export const HUMAN_AI_HUNGER_THRESHOLD_FOR_GATHERING: number = HUMAN_HUNGER_DEATH * 0.5; // AI decides to gather if hunger >= this
export const HUMAN_AI_HUNGER_THRESHOLD_FOR_PLANTING = HUMAN_HUNGER_DEATH * 0.7; // AI decides to plant if hunger >= this
export const HUMAN_AI_HUNGER_THRESHOLD_FOR_ATTACKING: number = HUMAN_HUNGER_DEATH * 0.8; // AI decides to attack if hunger >= this
export const HUMAN_CRITICAL_HUNGER_FOR_STEALING: number = 80; // Hunger level that overrides some safeguards
export const HUMAN_AI_IDLE_WANDER_CHANCE: number = 0.1; // Chance (0-1) to wander when idle
export const HUMAN_AI_IDLE_WANDER_COOLDOWN = 10;
export const HUMAN_AI_WANDER_RADIUS: number = 150; // Max radius for wandering
export const CHILD_MAX_WANDER_DISTANCE_FROM_PARENT: number = 100;
export const FEMALE_PARTNER_MAX_WANDER_DISTANCE_FROM_MALE_PARTNER: number = 100;
export const LEADER_FOLLOW_RADIUS = 250; // Radius within which followers will try to stay close to their leader
export const PROCREATION_MIN_NEARBY_BERRY_BUSHES: number = 2; // Minimum number of berry bushes needed nearby for AI to consider procreation
export const PROCREATION_FOOD_SEARCH_RADIUS: number = 400; // Radius in pixels to search for food sources when considering procreation
export const PROCREATION_PARTNER_SEARCH_RADIUS_LONG: number = 1000;
export const AI_ATTACK_HUNGER_THRESHOLD: number = HUMAN_HUNGER_DEATH * 0.85;
export const AI_DEFEND_CLAIMED_BUSH_RANGE: number = 100; // Range to defend claimed bush
export const AI_ATTACK_ENEMY_RANGE = 200; // Range in pixels for AI to attack an enemy
export const AI_DEFEND_BUSH_RANGE = 80; // Range in pixels for AI to defend a claimed bush
export const AI_TRIBE_BATTLE_RADIUS = 100; // Radius for tribe members to engage in battle around their leader
export const MAX_TRIBE_ATTACKERS_PER_TARGET = 3; // Maximum number of tribe members that should ideally attack a single target

export const BLACKBOARD_ENTRY_MAX_AGE_HOURS = 24; // Time in game hours to keep BT node history
export const ADULT_MALE_FAMILY_DISTANCE_RADIUS = 300; // Min distance an adult male with family tries to keep from his parents
export const TRIBE_CENTER_MAX_WANDER_DISTANCE = 500; // Max distance a tribe member will wander from the tribe's center
export const FAMILY_CENTER_MAX_WANDER_DISTANCE = 250; // Max distance a family member will wander from the family's center
export const ATTACK_CHASE_MAX_DISTANCE_FROM_CENTER = 600; // Max distance a human will chase an enemy from their home center

// Leader Meta AI Strategy Constants
export const LEADER_META_STRATEGY_COOLDOWN_HOURS = 10; // How often the leader re-evaluates the grand strategy
export const LEADER_WORLD_ANALYSIS_GRID_SIZE = 500; // The size of each cell in the world analysis grid
export const LEADER_WORLD_ANALYSIS_GRID_STEP = 400; // The distance between the centers of each cell
export const LEADER_HABITAT_SCORE_BUSH_WEIGHT = 10; // Points for each bush in a region
export const LEADER_HABITAT_SCORE_DANGER_WEIGHT = -5; // Points against for each enemy/dangerous entity in a region
export const LEADER_MIGRATION_SUPERIORITY_THRESHOLD = 1.5; // How much better a new habitat must be to consider moving
export const LEADER_AGGRESSION_TRIBE_STRENGTH_ADVANTAGE_THRESHOLD = 1.5; // How much stronger our tribe must be to consider attacking another for their habitat

export const LEADER_BT_CALL_TO_ATTACK_COOLDOWN_HOURS = 10;
// Human AI Fleeing Constants

// Player Action Constants
export const PLAYER_CALL_TO_ATTACK_DURATION_HOURS: number = 10;
export const PLAYER_CALL_TO_ATTACK_RADIUS: number = 250;
export const AI_FLEE_HEALTH_THRESHOLD = 0.3; // representing 30% of max health
export const AI_FLEE_DISTANCE = 200;

// Karma Constants
export const KARMA_ON_ATTACK = -25;
export const KARMA_ON_INFIDELITY = -10;
export const KARMA_ON_CLAIMED_BUSH_THEFT = -10;
export const KARMA_PROPAGATION_FACTOR = 0.5;
export const KARMA_INHERITANCE_FACTOR = 0.5;
export const KARMA_DECAY_RATE_PER_HOUR = 0.1;
export const KARMA_ENEMY_THRESHOLD = -50;
export const KARMA_NEUTRAL_THRESHOLD = -5;

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
export const PLAYER_ACTION_HINT_FONT_SIZE: number = 20;

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
