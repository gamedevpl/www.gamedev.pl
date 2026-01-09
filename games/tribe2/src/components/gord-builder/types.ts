import { Vector2D } from '../../game/utils/math-types';

/**
 * Represents a planned edge of a gord, which can be either a palisade or a gate.
 */
export interface PlannedGordEdge {
  from: Vector2D;
  to: Vector2D;
  isGate: boolean;
}

/**
 * Statistics and quality metrics for a planned gord.
 */
export interface GordPlanStats {
  perimeterLength: number;
  palisadeCount: number;
  gateCount: number;
  hubCount: number;
  enclosedArea: number;
  woodCost: number;
  qualityRating: 'Excellent' | 'Good' | 'Fair' | 'Poor';
}
