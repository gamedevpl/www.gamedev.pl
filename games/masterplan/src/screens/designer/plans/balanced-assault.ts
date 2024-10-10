import { Unit } from '../designer-types';
import { countUnitTypes, analyzePositions, averageUnitSize } from '../utils/plan-utils';

export const units: Unit[] = [
  { id: 201, col: -12, row: 0, sizeCol: 8, sizeRow: 2, type: 'warrior', command: 'advance-wait' },
  { id: 202, col: 0, row: 0, sizeCol: 8, sizeRow: 2, type: 'warrior', command: 'advance-wait' },
  { id: 203, col: 12, row: 0, sizeCol: 8, sizeRow: 2, type: 'warrior', command: 'advance-wait' },
  { id: 204, col: -8, row: -4, sizeCol: 4, sizeRow: 4, type: 'tank', command: 'advance' },
  { id: 205, col: 8, row: -4, sizeCol: 4, sizeRow: 4, type: 'tank', command: 'advance' },
  { id: 206, col: -16, row: -8, sizeCol: 4, sizeRow: 2, type: 'archer', command: 'wait-advance' },
  { id: 207, col: 16, row: -8, sizeCol: 4, sizeRow: 2, type: 'archer', command: 'wait-advance' },
  { id: 208, col: 2, row: -8, sizeCol: 8, sizeRow: 1, type: 'artillery', command: 'wait-advance' },
];

export const name = 'Balanced Assault';

export const probabilityScore = (playerUnits: Unit[]): number => {
  const playerUnitCounts = countUnitTypes(playerUnits);
  const playerPositions = analyzePositions(playerUnits);

  // Balanced composition score
  const compositionScore =
    1 -
    Math.abs(0.25 - playerUnitCounts.warrior / playerUnits.length) -
    Math.abs(0.25 - playerUnitCounts.archer / playerUnits.length) -
    Math.abs(0.25 - playerUnitCounts.tank / playerUnits.length) -
    Math.abs(0.25 - playerUnitCounts.artillery / playerUnits.length);

  // Position score (favor this plan if player units are spread out)
  const positionScore = (playerPositions.left + playerPositions.right + playerPositions.center) / 3;

  // Size score (favor this plan against average-sized units)
  const sizeScore = 1 - Math.abs(0.5 - averageUnitSize(playerUnits));

  // Combine scores (you can adjust weights as needed)
  return (compositionScore * 0.5 + positionScore * 0.3 + sizeScore * 0.2) * 100;
};
