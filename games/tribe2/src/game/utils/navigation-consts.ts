/**
 * Navigation-related constants shared between navigation modules.
 */

import { CHARACTER_RADIUS } from '../ui/ui-consts';

/**
 * Resolution of the navigation grid in pixels.
 * Set to 10px (finer than territory grid) for better small obstacle detection.
 */
export const NAV_GRID_RESOLUTION = 10;

/**
 * The standard radius used to inflate obstacles on the navigation grid.
 * Matches the HumanEntity radius to ensure they can navigate gaps.
 */
export const NAVIGATION_AGENT_RADIUS = CHARACTER_RADIUS;

/**
 * Maximum weight assigned to a padding cell.
 * Used to create a gradual penalty field around obstacles.
 */
export const PADDING_MAX_WEIGHT = 100;
