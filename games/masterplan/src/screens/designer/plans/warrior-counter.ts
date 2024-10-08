import { Unit } from '../designer-types';
import { countUnitTypes, calculateSpreadScore, averageUnitSize } from '../utils/plan-utils';

export const units: Unit[] = [
  { id: 301, col: -16, row: -8, sizeCol: 4, sizeRow: 2, type: 'archer', command: 'wait' },
  { id: 302, col: -8, row: -8, sizeCol: 4, sizeRow: 2, type: 'archer', command: 'wait' },
  { id: 303, col: 8, row: -8, sizeCol: 4, sizeRow: 2, type: 'archer', command: 'wait' },
  { id: 304, col: 16, row: -8, sizeCol: 4, sizeRow: 2, type: 'archer', command: 'wait' },
  { id: 305, col: -12, row: -4, sizeCol: 8, sizeRow: 1, type: 'artillery', command: 'wait' },
  { id: 306, col: 12, row: -4, sizeCol: 8, sizeRow: 1, type: 'artillery', command: 'wait' },
  { id: 307, col: -8, row: 0, sizeCol: 4, sizeRow: 4, type: 'tank', command: 'defend' },
  { id: 308, col: 8, row: 0, sizeCol: 4, sizeRow: 4, type: 'tank', command: 'defend' },
];

export const name = 'Warrior Counter';

export const probabilityScore = (playerUnits: Unit[]): number => {
  const playerUnitCounts = countUnitTypes(playerUnits);
  const totalUnits = playerUnits.length;

  // Calculate the percentage of warrior units in the player's formation
  const warriorPercentage = (playerUnitCounts.warrior || 0) / totalUnits;

  // Calculate how spread out the enemy units are
  const spreadScore = calculateSpreadScore(playerUnits);

  // Composition score (favor this plan when there are more warriors)
  const compositionScore = Math.min(warriorPercentage * 2, 1); // Cap at 1 for 50% or more warriors

  // Position score (favor this plan if enemy units are clustered)
  const positionScore = 1 - spreadScore;

  // Size score (favor this plan against smaller units, especially warriors)
  const sizeScore = 1 - averageUnitSize(playerUnits.filter((unit) => unit.type === 'warrior'));

  // Combine scores (you can adjust weights as needed)
  return (compositionScore * 0.5 + positionScore * 0.3 + sizeScore * 0.2) * 100;
};
