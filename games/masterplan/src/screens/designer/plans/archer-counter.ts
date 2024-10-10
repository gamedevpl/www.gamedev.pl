import { Unit } from '../designer-types';
import { countUnitTypes, analyzePositions, averageUnitSize } from '../utils/plan-utils';

export const units: Unit[] = [
  { id: 401, col: -12, row: -2, sizeCol: 4, sizeRow: 2, type: 'tank', command: 'flank-left' },
  { id: 402, col: 12, row: -2, sizeCol: 4, sizeRow: 2, type: 'tank', command: 'flank-right' },
  { id: 403, col: 0, row: -6, sizeCol: 6, sizeRow: 3, type: 'artillery', command: 'wait-advance' },
  { id: 404, col: -16, row: 0, sizeCol: 6, sizeRow: 2, type: 'warrior', command: 'advance' },
  { id: 405, col: 16, row: 0, sizeCol: 6, sizeRow: 2, type: 'warrior', command: 'advance' },
  { id: 406, col: -8, row: -10, sizeCol: 4, sizeRow: 3, type: 'tank', command: 'advance' },
  { id: 407, col: 8, row: -10, sizeCol: 4, sizeRow: 3, type: 'tank', command: 'advance' },
  { id: 408, col: -4, row: -4, sizeCol: 4, sizeRow: 2, type: 'warrior', command: 'advance' },
  { id: 409, col: 4, row: -4, sizeCol: 4, sizeRow: 2, type: 'warrior', command: 'advance' },
];

export const name = 'Archer Counter';

export const probabilityScore = (playerUnits: Unit[]): number => {
  const playerUnitCounts = countUnitTypes(playerUnits);
  const playerPositions = analyzePositions(playerUnits);

  // Composition score (favor this plan when there are more archers)
  const archerRatio = playerUnitCounts.archer / playerUnits.length;
  const compositionScore = Math.min(archerRatio * 2, 1); // Cap at 1 for 50% or more archers

  // Position score (favor this plan if player units are spread out or on the flanks)
  const positionScore = Math.max(playerPositions.left, playerPositions.right);

  // Size score (favor this plan against smaller units, especially archers)
  const sizeScore = 1 - averageUnitSize(playerUnits.filter((unit) => unit.type === 'archer'));

  // Combine scores (you can adjust weights as needed)
  return (compositionScore * 0.5 + positionScore * 0.3 + sizeScore * 0.2) * 100;
};
