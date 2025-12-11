/**
 * Constants for the tribe territory system.
 */

/** Base radius around each building that contributes to territory */
export const TERRITORY_BUILDING_RADIUS = 80;

/** Base radius around the tribe center that contributes to territory */
export const TERRITORY_CENTER_RADIUS = 200;

/** Distance from territory border within which new buildings can be placed */
export const TERRITORY_BORDER_PLACEMENT_DISTANCE = 50;

/** Maximum distance a tribe member will wander from territory edge */
export const TERRITORY_WANDER_DISTANCE = 100;

/** Minimum distance between territories of different tribes */
export const TERRITORY_MINIMUM_GAP = 20;

/** Alpha value for territory border rendering */
export const TERRITORY_BORDER_ALPHA = 0.8;

/** Colors for different tribes' territories (indexed by tribe order) */
export const TERRITORY_COLORS = [
  '#4CAF50', // Green (player tribe)
  '#F44336', // Red
  '#2196F3', // Blue
  '#FF9800', // Orange
  '#9C27B0', // Purple
  '#00BCD4', // Cyan
  '#FFEB3B', // Yellow
  '#795548', // Brown
];
