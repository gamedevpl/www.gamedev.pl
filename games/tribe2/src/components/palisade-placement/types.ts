import { Vector2D } from '../../game/utils/math-types';

// Types for gord planning
export interface PlannedGordPosition {
  position: Vector2D;
  isGate: boolean;
}

export interface GordPlanStats {
  perimeterLength: number;
  palisadeCount: number;
  gateCount: number;
  hubCount: number;
  enclosedArea: number;
  defenseEfficiency: number;
  compactness: number;
  accessibilityScore: number;
  protectionScore: number;
  averageProtectionDistance: number;
  woodCost: number;
  qualityRating: 'Excellent' | 'Good' | 'Fair' | 'Poor';
}
