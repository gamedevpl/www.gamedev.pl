import { Unit } from '../designer-types';
import { countUnitTypes, analyzePositions, averageUnitSize, calculateSpreadScore } from '../utils/plan-utils';

export const units: Unit[] = [
  // Artillery line (reduced from 5 to 3 units)
  { id: 601, col: -16, row: -8, sizeCol: 6, sizeRow: 2, type: 'artillery', command: 'advance' },
  { id: 602, col: 0, row: -8, sizeCol: 6, sizeRow: 2, type: 'artillery', command: 'advance' },
  { id: 603, col: 16, row: -8, sizeCol: 6, sizeRow: 2, type: 'artillery', command: 'advance' },

  // Archer support (reduced from 4 to 3 units)
  { id: 604, col: -12, row: -4, sizeCol: 4, sizeRow: 2, type: 'archer', command: 'advance' },
  { id: 605, col: 0, row: -4, sizeCol: 4, sizeRow: 2, type: 'archer', command: 'advance' },
  { id: 606, col: 12, row: -4, sizeCol: 4, sizeRow: 2, type: 'archer', command: 'advance' },

  // Defensive warrior line (reduced from 5 to 3 units)
  { id: 607, col: -16, row: 0, sizeCol: 6, sizeRow: 2, type: 'warrior', command: 'wait-advance' },
  { id: 608, col: 0, row: 0, sizeCol: 6, sizeRow: 2, type: 'warrior', command: 'wait-advance' },
  { id: 609, col: 16, row: 0, sizeCol: 6, sizeRow: 2, type: 'warrior', command: 'wait-advance' },

  // Tank reserves (kept 2 units)
  { id: 610, col: -10, row: -6, sizeCol: 4, sizeRow: 4, type: 'tank', command: 'wait-advance' },
  { id: 611, col: 10, row: -6, sizeCol: 4, sizeRow: 4, type: 'tank', command: 'wait-advance' },
];

export const name = 'Scorched Earth';

export const probabilityScore = (playerUnits: Unit[]): number => {
  const playerUnitCounts = countUnitTypes(playerUnits);
  const playerPositions = analyzePositions(playerUnits);
  const spreadScore = calculateSpreadScore(playerUnits);
  const avgSize = averageUnitSize(playerUnits);

  // Favor this plan when the enemy has a low proportion of artillery and archers (vulnerable to our long-range attacks)
  const lowRangedScore = 1 - (playerUnitCounts.artillery + playerUnitCounts.archer) / playerUnits.length;

  // Favor this plan when the enemy is more spread out (easier to bombard effectively)
  const spreadOutScore = spreadScore;

  // Favor this plan when there's a high proportion of enemy units at the front (vulnerable to our artillery)
  const frontlineScore = playerPositions.front;

  // Slightly favor this plan against larger units (better targets for artillery)
  const largeUnitScore = avgSize;

  // Favor this plan when the enemy has a high proportion of slow units (warriors and tanks)
  const slowUnitScore = (playerUnitCounts.warrior + playerUnitCounts.tank) / playerUnits.length;

  // Combine scores (adjust weights as needed)
  return (
    (lowRangedScore * 0.25 +
      spreadOutScore * 0.2 +
      frontlineScore * 0.2 +
      largeUnitScore * 0.15 +
      slowUnitScore * 0.2) *
    100
  );
};
