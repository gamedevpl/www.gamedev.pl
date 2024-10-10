import { Unit } from '../designer-types';
import { countUnitTypes, analyzePositions, averageUnitSize, calculateSpreadScore } from '../utils/plan-utils';

export const units: Unit[] = [
  // Front line of warriors forming the shield wall (reduced from 5 to 3 units)
  { id: 401, col: -16, row: 0, sizeCol: 8, sizeRow: 2, type: 'warrior', command: 'wait-advance' },
  { id: 402, col: 0, row: 0, sizeCol: 8, sizeRow: 2, type: 'warrior', command: 'wait-advance' },
  { id: 403, col: 16, row: 0, sizeCol: 8, sizeRow: 2, type: 'warrior', command: 'wait-advance' },

  // Second line of archers for ranged support (reduced from 4 to 3 units)
  { id: 404, col: -12, row: -4, sizeCol: 4, sizeRow: 2, type: 'archer', command: 'advance' },
  { id: 405, col: 0, row: -4, sizeCol: 4, sizeRow: 2, type: 'archer', command: 'advance' },
  { id: 406, col: 12, row: -4, sizeCol: 4, sizeRow: 2, type: 'archer', command: 'advance' },

  // Artillery at the back for long-range support (reduced from 2 to 1 unit)
  { id: 407, col: 0, row: -8, sizeCol: 8, sizeRow: 2, type: 'artillery', command: 'advance' },

  // Tanks as mobile reserves (kept 2 units)
  { id: 408, col: -16, row: -6, sizeCol: 4, sizeRow: 4, type: 'tank', command: 'wait-advance' },
  { id: 409, col: 16, row: -6, sizeCol: 4, sizeRow: 4, type: 'tank', command: 'wait-advance' },
];

export const name = 'Shield Wall';

export const probabilityScore = (playerUnits: Unit[]): number => {
  const playerUnitCounts = countUnitTypes(playerUnits);
  const playerPositions = analyzePositions(playerUnits);
  const spreadScore = calculateSpreadScore(playerUnits);
  const avgSize = averageUnitSize(playerUnits);

  // Favor this plan when the enemy has a high proportion of melee units (warriors and tanks)
  const meleeRatio = (playerUnitCounts.warrior + playerUnitCounts.tank) / playerUnits.length;

  // Favor this plan when the enemy has a frontal assault formation
  const frontalAssaultScore = playerPositions.front;

  // Favor this plan when the enemy units are more spread out (easier to defend against)
  const enemySpreadScore = spreadScore;

  // Slightly favor this plan against larger units (easier targets for archers and artillery)
  const largeUnitScore = avgSize;

  // Combine scores (adjust weights as needed)
  return (meleeRatio * 0.35 + frontalAssaultScore * 0.25 + enemySpreadScore * 0.2 + largeUnitScore * 0.2) * 100;
};
