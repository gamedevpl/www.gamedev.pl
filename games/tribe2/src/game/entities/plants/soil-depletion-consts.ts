/**
 * Constants for the soil depletion system.
 * Controls how soil gets depleted and recovers over time.
 */

// Grid configuration - soil is tracked in a grid of sectors
export const SOIL_SECTOR_SIZE = 20; // Size of each soil sector in pixels

// Depletion thresholds
export const SOIL_HEALTH_MAX = 100; // Maximum soil health
export const SOIL_HEALTH_DEPLETED_THRESHOLD = 20; // Below this, soil is considered depleted
export const SOIL_HEALTH_MIN = 0; // Minimum soil health

// Depletion rates (per game hour)
export const SOIL_DEPLETION_PER_BUSH_PLANT = 20; // Soil health lost when a bush is planted
export const SOIL_DEPLETION_PER_WALK = 1.0; // Soil health lost per walk step
export const SOIL_WALK_DEPLETION_COOLDOWN_HOURS = 0.15; // Short cooldown for frequent depletion

// Recovery rates (per game hour)
export const SOIL_RECOVERY_RATE_BASE = 0.5; // Base recovery rate when not in use
export const SOIL_RECOVERY_RATE_ADJACENT_BONUS = 0.01; // Additional recovery when adjacent to viable soil
export const SOIL_RECOVERY_INACTIVE_THRESHOLD_HOURS = 24; // Time without activity before recovery starts

// Visual rendering
export const SOIL_DEPLETED_COLOR = '#6B5344'; // Darker brown for depleted soil
export const SOIL_DEPLETED_BORDER_COLOR = '#4A3728'; // Even darker for border/cliff effect
export const SOIL_DEPLETED_OPACITY = 0.85; // Fixed opacity for clear visibility
export const SOIL_DEPLETED_RENDER_THRESHOLD = 35; // Start showing depletion visual below this health
export const SOIL_VISIBLE_DEPLETION_THRESHOLD = 30; // Threshold for clearly visible depletion

// Movement bonus on depleted soil
export const SOIL_DEPLETED_SPEED_BONUS = 1.25; // 25% faster movement on depleted paths

// Movement steering towards depleted soil (walkpaths)
export const SOIL_STEERING_SAMPLE_DISTANCE = 40;
export const SOIL_STEERING_SAMPLE_ANGLE = Math.PI / 6; // 30 degrees

// Depletion modifier for planting zones
export const SOIL_DEPLETION_PLANTING_ZONE_MULTIPLIER = 0.5;

// Soil update interval
export const SOIL_UPDATE_INTERVAL_HOURS = 1;
