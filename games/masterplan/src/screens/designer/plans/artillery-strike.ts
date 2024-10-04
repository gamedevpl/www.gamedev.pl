import { Unit } from '../designer-screen';
import { countUnitTypes, analyzePositions, averageUnitSize } from '../utils/plan-utils';

export const units: Unit[] = [
  { id: 701, col: -16, row: -4, sizeCol: 8, sizeRow: 4, type: 'artillery', command: 'advance' },
  { id: 702, col: 16, row: -4, sizeCol: 8, sizeRow: 4, type: 'artillery', command: 'advance' },
  { id: 703, col: 0, row: 0, sizeCol: 8, sizeRow: 4, type: 'tank', command: 'advance-wait' },
  { id: 704, col: -8, row: -10, sizeCol: 4, sizeRow: 2, type: 'archer', command: 'wait' },
  { id: 705, col: 8, row: -10, sizeCol: 4, sizeRow: 2, type: 'archer', command: 'wait' },
  { id: 706, col: -12, row: -12, sizeCol: 4, sizeRow: 4, type: 'tank', command: 'advance' },
  { id: 707, col: 12, row: -12, sizeCol: 4, sizeRow: 4, type: 'tank', command: 'advance' },
  { id: 708, col: 0, row: -14, sizeCol: 8, sizeRow: 1, type: 'artillery', command: 'wait' },
];

export const name = 'Artillery Strike';

export const probabilityScore = (playerUnits: Unit[]): number => {
  const playerUnitCounts = countUnitTypes(playerUnits);
  const playerPositions = analyzePositions(playerUnits);

  // Composition score (favor this plan when there are more slow-moving units like tanks and artillery)
  const slowUnitRatio = (playerUnitCounts.tank + playerUnitCounts.artillery) / playerUnits.length;
  const compositionScore = Math.min(slowUnitRatio * 2, 1); // Cap at 1 for 50% or more slow units

  // Position score (favor this plan if player units are concentrated)
  const positionScore = Math.max(playerPositions.left, playerPositions.center, playerPositions.right);

  // Size score (favor this plan against larger units)
  const sizeScore = averageUnitSize(playerUnits);

  // Combine scores (you can adjust weights as needed)
  return (compositionScore * 0.4 + positionScore * 0.4 + sizeScore * 0.2) * 100;
};