import { Unit } from '../designer-types';
import { countUnitTypes, analyzePositions, calculateSpreadScore } from '../utils/plan-utils';

export const units: Unit[] = [
  // Left flank
  { id: 301, col: -14, row: -2, sizeCol: 4, sizeRow: 3, type: 'tank', command: 'flank-left' },
  { id: 302, col: -18, row: -6, sizeCol: 4, sizeRow: 2, type: 'archer', command: 'flank-left' },
  { id: 303, col: -16, row: 2, sizeCol: 6, sizeRow: 2, type: 'warrior', command: 'flank-left' },

  // Center
  { id: 304, col: -4, row: 0, sizeCol: 6, sizeRow: 2, type: 'warrior', command: 'advance' },
  { id: 305, col: 4, row: 0, sizeCol: 6, sizeRow: 2, type: 'warrior', command: 'advance' },
  { id: 306, col: 0, row: -6, sizeCol: 6, sizeRow: 2, type: 'artillery', command: 'advance' },

  // Right flank
  { id: 307, col: 14, row: -2, sizeCol: 4, sizeRow: 3, type: 'tank', command: 'flank-right' },
  { id: 308, col: 18, row: -6, sizeCol: 4, sizeRow: 2, type: 'archer', command: 'flank-right' },
  { id: 309, col: 16, row: 2, sizeCol: 6, sizeRow: 2, type: 'warrior', command: 'flank-right' },
];

export const name = 'Pincer Attack';

export const probabilityScore = (playerUnits: Unit[]): number => {
  const playerUnitCounts = countUnitTypes(playerUnits);
  const playerPositions = analyzePositions(playerUnits);
  const spreadScore = calculateSpreadScore(playerUnits);

  // Favor this plan when the enemy has a centralized formation
  const centralizationScore = 1 - (playerPositions.left + playerPositions.right) / 2;

  // Favor this plan when the enemy has a balanced unit composition
  const compositionBalance =
    1 -
    Math.max(
      Math.abs(playerUnitCounts.warrior - playerUnitCounts.archer),
      Math.abs(playerUnitCounts.warrior - playerUnitCounts.tank),
      Math.abs(playerUnitCounts.warrior - playerUnitCounts.artillery),
      Math.abs(playerUnitCounts.archer - playerUnitCounts.tank),
      Math.abs(playerUnitCounts.archer - playerUnitCounts.artillery),
      Math.abs(playerUnitCounts.tank - playerUnitCounts.artillery),
    ) /
      playerUnits.length;

  // Favor this plan when the enemy units are not too spread out
  const compactnessScore = 1 - spreadScore;

  // Combine scores (adjust weights as needed)
  return (centralizationScore * 0.4 + compositionBalance * 0.3 + compactnessScore * 0.3) * 100;
};