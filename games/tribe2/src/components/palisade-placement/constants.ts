import { GORD_SAFE_RADIUS } from '../../game/ai/task/tribes/gord-boundary-utils';

// Canvas dimensions
export const CANVAS_WIDTH = 800;
export const CANVAS_HEIGHT = 600;

// Default safe radius for gord perimeter (in pixels)
export const DEFAULT_GORD_SAFE_RADIUS = GORD_SAFE_RADIUS;

// Quality scoring thresholds for gord evaluation
export const DEFENSE_EFFICIENCY_EXCELLENT = 800;
export const DEFENSE_EFFICIENCY_GOOD = 500;
export const DEFENSE_EFFICIENCY_FAIR = 300;

export const COMPACTNESS_EXCELLENT = 0.7;
export const COMPACTNESS_GOOD = 0.5;
export const COMPACTNESS_FAIR = 0.3;

export const ACCESSIBILITY_MIN_OPTIMAL = 0.05;
export const ACCESSIBILITY_MAX_OPTIMAL = 0.15;
export const ACCESSIBILITY_MIN_ACCEPTABLE = 0.02;
export const ACCESSIBILITY_MAX_ACCEPTABLE = 0.25;

export const QUALITY_EXCELLENT_THRESHOLD = 80;
export const QUALITY_GOOD_THRESHOLD = 60;
export const QUALITY_FAIR_THRESHOLD = 40;
