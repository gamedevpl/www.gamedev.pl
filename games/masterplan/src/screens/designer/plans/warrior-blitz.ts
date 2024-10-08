import { Unit } from '../designer-types';
import { countUnitTypes, analyzePositions, averageUnitSize } from '../utils/plan-utils';

export const units: Unit[] = [
  { id: 501, col: -12, row: 0, sizeCol: 8, sizeRow: 2, type: 'warrior', command: 'advance' },
  { id: 502, col: 12, row: 0, sizeCol: 8, sizeRow: 2, type: 'warrior', command: 'advance' },
  { id: 503, col: -8, row: -4, sizeCol: 4, sizeRow: 2, type: 'archer', command: 'flank-left' },
  { id: 504, col: 8, row: -4, sizeCol: 4, sizeRow: 2, type: 'archer', command: 'flank-right' },
  { id: 505, col: -16, row: -2, sizeCol: 8, sizeRow: 2, type: 'warrior', command: 'advance' },
  { id: 506, col: 16, row: -2, sizeCol: 8, sizeRow: 2, type: 'warrior', command: 'advance' },
  { id: 507, col: 0, row: -6, sizeCol: 8, sizeRow: 4, type: 'artillery', command: 'wait' },
  { id: 508, col: 0, row: -10, sizeCol: 8, sizeRow: 1, type: 'artillery', command: 'wait' },
];

export const name = 'Warrior Blitz';

export const probabilityScore = (playerUnits: Unit[]): number => {
  const playerUnitCounts = countUnitTypes(playerUnits);
  const playerPositions = analyzePositions(playerUnits);

  // Composition score (favor this plan when there are fewer tanks and more small units)
  const tankRatio = playerUnitCounts.tank / playerUnits.length;
  const smallUnitRatio = (playerUnitCounts.warrior + playerUnitCounts.archer) / playerUnits.length;
  const compositionScore = (1 - tankRatio) * 0.5 + smallUnitRatio * 0.5;

  // Position score (favor this plan if player units are concentrated in the center)
  const positionScore = playerPositions.center;

  // Size score (favor this plan against smaller units)
  const sizeScore = 1 - averageUnitSize(playerUnits);

  // Combine scores (you can adjust weights as needed)
  return (compositionScore * 0.4 + positionScore * 0.4 + sizeScore * 0.2) * 100;
};
