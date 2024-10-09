import { Unit } from '../designer-types';
import { countUnitTypes, analyzePositions, averageUnitSize, calculateSpreadScore } from '../utils/plan-utils';

export const units: Unit[] = [
  // Tip of the V (Tank)
  { id: 801, col: 0, row: 2, sizeCol: 4, sizeRow: 4, type: 'tank', command: 'lead' },

  // Left wing of the V
  { id: 802, col: -4, row: 0, sizeCol: 4, sizeRow: 4, type: 'tank', command: 'support-left' },
  { id: 803, col: -8, row: -2, sizeCol: 6, sizeRow: 2, type: 'warrior', command: 'support-left' },
  { id: 804, col: -12, row: -4, sizeCol: 4, sizeRow: 2, type: 'archer', command: 'cover-left' },
  { id: 805, col: -16, row: -6, sizeCol: 6, sizeRow: 2, type: 'artillery', command: 'bombard-left' },

  // Right wing of the V
  { id: 806, col: 4, row: 0, sizeCol: 4, sizeRow: 4, type: 'tank', command: 'support-right' },
  { id: 807, col: 8, row: -2, sizeCol: 6, sizeRow: 2, type: 'warrior', command: 'support-right' },
  { id: 808, col: 12, row: -4, sizeCol: 4, sizeRow: 2, type: 'archer', command: 'cover-right' },
  { id: 809, col: 16, row: -6, sizeCol: 6, sizeRow: 2, type: 'artillery', command: 'bombard-right' },

  // Center support (reduced from 2 to 1 unit)
  { id: 810, col: 0, row: -4, sizeCol: 6, sizeRow: 2, type: 'warrior', command: 'defend-center' },
];

export const name = 'Flying V';

export const probabilityScore = (playerUnits: Unit[]): number => {
  const playerUnitCounts = countUnitTypes(playerUnits);
  const playerPositions = analyzePositions(playerUnits);
  const spreadScore = calculateSpreadScore(playerUnits);
  const avgSize = averageUnitSize(playerUnits);

  // Favor this plan when the enemy has a centralized formation (vulnerable to our V-shape)
  const centralizationScore = 1 - (playerPositions.left + playerPositions.right) / 2;

  // Favor this plan when the enemy has a balanced unit composition (our V is versatile)
  const compositionBalance = 1 - Math.max(
    Math.abs(playerUnitCounts.warrior - playerUnitCounts.archer),
    Math.abs(playerUnitCounts.warrior - playerUnitCounts.tank),
    Math.abs(playerUnitCounts.warrior - playerUnitCounts.artillery),
    Math.abs(playerUnitCounts.archer - playerUnitCounts.tank),
    Math.abs(playerUnitCounts.archer - playerUnitCounts.artillery),
    Math.abs(playerUnitCounts.tank - playerUnitCounts.artillery)
  ) / playerUnits.length;

  // Slightly favor this plan when enemy units are more spread out (our V can adapt)
  const spreadOutScore = spreadScore;

  // Favor this plan when there's a high proportion of enemy units at the front (vulnerable to our V-tip)
  const frontlineScore = playerPositions.front;

  // Slightly favor this plan against smaller units (our V formation can overwhelm them)
  const smallUnitScore = 1 - avgSize;

  // Combine scores (adjust weights as needed)
  return (centralizationScore * 0.3 + compositionBalance * 0.2 + spreadOutScore * 0.15 + frontlineScore * 0.25 + smallUnitScore * 0.1) * 100;
};