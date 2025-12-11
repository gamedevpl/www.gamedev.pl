/**
 * Constants for the soil depletion system.
 * Controls how soil gets depleted and recovers over time.
 */

// Grid configuration - soil is tracked in a grid of sectors
export const SOIL_SECTOR_SIZE = 50; // Size of each soil sector in pixels

// Depletion thresholds
export const SOIL_HEALTH_MAX = 100; // Maximum soil health
export const SOIL_HEALTH_DEPLETED_THRESHOLD = 20; // Below this, soil is considered depleted
export const SOIL_HEALTH_MIN = 0; // Minimum soil health

// Depletion rates (per game hour)
export const SOIL_DEPLETION_PER_BUSH_PLANT = 15; // Soil health lost when a bush is planted
export const SOIL_DEPLETION_PER_WALK = 0.5; // Soil health lost per walk step (accumulated)
export const SOIL_WALK_DEPLETION_COOLDOWN_HOURS = 0.1; // Cooldown before same entity can deplete same sector again

// Recovery rates (per game hour)
export const SOIL_RECOVERY_RATE_BASE = 0.5; // Base recovery rate when not in use
export const SOIL_RECOVERY_RATE_ADJACENT_BONUS = 0.3; // Additional recovery when adjacent to viable soil
export const SOIL_RECOVERY_INACTIVE_THRESHOLD_HOURS = 2; // Time without activity before recovery starts

// Visual rendering
export const SOIL_DEPLETED_COLOR = '#8B7355'; // Brown/tan color for depleted soil
export const SOIL_DEPLETED_OPACITY_MAX = 0.6; // Maximum opacity for fully depleted soil
export const SOIL_DEPLETED_RENDER_THRESHOLD = 50; // Start showing depletion visual below this health
