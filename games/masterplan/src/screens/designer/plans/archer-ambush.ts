import { Unit } from '../designer-screen';
import { countUnitTypes, analyzePositions, averageUnitSize } from '../utils/plan-utils';

export const units: Unit[] = [
  { id: 801, col: -16, row: -4, sizeCol: 4, sizeRow: 2, type: 'archer', command: 'wait' },
  { id: 802, col: -8, row: -4, sizeCol: 4, sizeRow: 2, type: 'archer', command: 'wait' },
  { id: 803, col: 0, row: -4, sizeCol: 4, sizeRow: 2, type: 'archer', command: 'wait' },
  { id: 804, col: 8, row: -4, sizeCol: 4, sizeRow: 2, type: 'archer', command: 'wait' },
  { id: 805, col: 16, row: -4, sizeCol: 4, sizeRow: 2, type: 'archer', command: 'wait' },
  { id: 806, col: -12, row: -10, sizeCol: 4, sizeRow: 4, type: 'tank', command: 'advance' },
  { id: 807, col: 12, row: -10, sizeCol: 4, sizeRow: 4, type: 'tank', command: 'advance' },
  { id: 808, col: 0, row: -14, sizeCol: 8, sizeRow: 1, type: 'artillery', command: 'wait' },
];

export const name = 'Archer Ambush';

export const probabilityScore = (playerUnits: Unit[]): number => {
  const playerUnitCounts = countUnitTypes(playerUnits);
  const playerPositions = analyzePositions(playerUnits);

  // Composition score (favor this plan when there are more melee units like warriors and tanks)
  const meleeUnitRatio = (playerUnitCounts.warrior + playerUnitCounts.tank) / playerUnits.length;
  const compositionScore = Math.min(meleeUnitRatio * 1.5, 1); // Cap at 1 for 66% or more melee units

  // Position score (favor this plan if player units are advancing, i.e., more units in the center and front)
  const positionScore = playerPositions.center + playerPositions.front * 0.5;

  // Size score (favor this plan against medium to large units)
  const sizeScore = averageUnitSize(playerUnits);

  // Combine scores (you can adjust weights as needed)
  return (compositionScore * 0.4 + positionScore * 0.4 + sizeScore * 0.2) * 100;
};