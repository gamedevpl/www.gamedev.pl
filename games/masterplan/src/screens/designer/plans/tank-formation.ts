import { Unit } from '../designer-screen';
import { countUnitTypes, analyzePositions, averageUnitSize } from '../utils/plan-utils';

export const units: Unit[] = [
  { id: 601, col: -12, row: -4, sizeCol: 4, sizeRow: 4, type: 'tank', command: 'advance-wait' },
  { id: 602, col: 12, row: -4, sizeCol: 4, sizeRow: 4, type: 'tank', command: 'advance-wait' },
  { id: 603, col: -16, row: 0, sizeCol: 8, sizeRow: 2, type: 'warrior', command: 'advance' },
  { id: 604, col: 16, row: 0, sizeCol: 8, sizeRow: 2, type: 'warrior', command: 'advance' },
  { id: 605, col: 0, row: -8, sizeCol: 8, sizeRow: 1, type: 'artillery', command: 'wait' },
  { id: 606, col: -8, row: -10, sizeCol: 4, sizeRow: 2, type: 'archer', command: 'wait' },
  { id: 607, col: 8, row: -10, sizeCol: 4, sizeRow: 2, type: 'archer', command: 'wait' },
  { id: 608, col: 0, row: -12, sizeCol: 8, sizeRow: 1, type: 'artillery', command: 'wait' },
];

export const name = 'Tank Formation';

export const probabilityScore = (playerUnits: Unit[]): number => {
  const playerUnitCounts = countUnitTypes(playerUnits);
  const playerPositions = analyzePositions(playerUnits);

  // Composition score (favor this plan when there are more warriors and archers)
  const warriorArcherRatio = (playerUnitCounts.warrior + playerUnitCounts.archer) / playerUnits.length;
  const compositionScore = Math.min(warriorArcherRatio * 1.5, 1); // Cap at 1 for 66% or more warriors/archers

  // Position score (favor this plan if player units are spread out)
  const positionScore = 1 - playerPositions.center; // Higher score for less center concentration

  // Size score (favor this plan against smaller units)
  const sizeScore = 1 - averageUnitSize(playerUnits);

  // Combine scores (you can adjust weights as needed)
  return (compositionScore * 0.4 + positionScore * 0.4 + sizeScore * 0.2) * 100;
};