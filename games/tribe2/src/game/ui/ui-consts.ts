// UI and Rendering Constants

// Rendering Constants
export const CHARACTER_RADIUS = 30;
export const CHARACTER_CHILD_RADIUS = CHARACTER_RADIUS * 0.6; // Smaller radius for child characters

// Highlight Colors
export const PLAYER_HIGHLIGHT_COLOR: string = '#4CAF50'; // Green
export const PLAYER_PARENT_HIGHLIGHT_COLOR: string = '#FF5722'; // Deep Orange
export const PLAYER_PARTNER_HIGHLIGHT_COLOR: string = '#9C27B0'; // Purple
export const PLAYER_CHILD_HIGHLIGHT_COLOR: string = '#2196F3'; // Blue
export const PLAYER_HEIR_HIGHLIGHT_COLOR: string = '#FFC107'; // Amber/Gold
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
export const UI_BT_DEBUG_FONT_SIZE = 10;
export const UI_BT_DEBUG_LINE_HEIGHT = 12;
export const UI_BT_DEBUG_INDENT_SIZE = 10;
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

// LLM Autopilot UI Constants
export const UI_AUTOPILOT_BUTTON_SIZE = 80;
export const UI_AUTOPILOT_BUTTON_SPACING = 10;

// UI Notification Constants
export const UI_NOTIFICATION_PANEL_WIDTH: number = 300;
export const UI_NOTIFICATION_PANEL_PADDING: number = 15;
export const UI_NOTIFICATION_PANEL_BORDER_RADIUS: number = 8;
export const UI_NOTIFICATION_PANEL_BACKGROUND_COLOR: string = 'rgba(0, 0, 0, 0.8)';
export const UI_NOTIFICATION_TEXT_COLOR: string = '#FFFFFF';
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
