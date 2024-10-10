import { Unit } from '../designer-types';
import { countUnitTypes, analyzePositions, averageUnitSize, calculateSpreadScore } from '../utils/plan-utils';

export const units: Unit[] = [
  // Visible "weak" front line (reduced from 3 to 2 units)
  { id: 701, col: -8, row: 0, sizeCol: 8, sizeRow: 2, type: 'warrior', command: 'advance' },
  { id: 702, col: 8, row: 0, sizeCol: 8, sizeRow: 2, type: 'warrior', command: 'advance' },
  
  // Hidden strong units (reduced from 4 to 3 tanks)
  { id: 703, col: -8, row: -4, sizeCol: 4, sizeRow: 4, type: 'tank', command: 'wait-advance' },
  { id: 704, col: 0, row: -4, sizeCol: 4, sizeRow: 4, type: 'tank', command: 'wait-advance' },
  { id: 705, col: 8, row: -4, sizeCol: 4, sizeRow: 4, type: 'tank', command: 'wait-advance' },
  
  // Hidden artillery support (kept 2 units)
  { id: 706, col: -12, row: -8, sizeCol: 6, sizeRow: 2, type: 'artillery', command: 'advance-wait' },
  { id: 707, col: 12, row: -8, sizeCol: 6, sizeRow: 2, type: 'artillery', command: 'advance-wait' },
  
  // Hidden archer support (reduced from 4 to 3 units)
  { id: 708, col: -16, row: -6, sizeCol: 4, sizeRow: 2, type: 'archer', command: 'wait-advance' },
  { id: 709, col: 0, row: -6, sizeCol: 4, sizeRow: 2, type: 'archer', command: 'wait-advance' },
  { id: 710, col: 16, row: -6, sizeCol: 4, sizeRow: 2, type: 'archer', command: 'wait-advance' },
];

export const name = 'Trojan Horse';

export const probabilityScore = (playerUnits: Unit[]): number => {
  const playerUnitCounts = countUnitTypes(playerUnits);
  const playerPositions = analyzePositions(playerUnits);
  const spreadScore = calculateSpreadScore(playerUnits);
  const avgSize = averageUnitSize(playerUnits);

  // Favor this plan when the enemy has a high proportion of aggressive units (warriors and tanks)
  const aggressiveUnitScore = (playerUnitCounts.warrior + playerUnitCounts.tank) / playerUnits.length;

  // Favor this plan when the enemy formation is more concentrated at the front
  const frontConcentrationScore = playerPositions.front;

  // Slightly favor this plan when enemy units are less spread out (easier to lure into a trap)
  const compactnessScore = 1 - spreadScore;

  // Favor this plan when the enemy has fewer long-range units (less likely to detect our hidden units)
  const lowRangedScore = 1 - ((playerUnitCounts.artillery + playerUnitCounts.archer) / playerUnits.length);

  // Slightly favor this plan against larger units (easier targets for our hidden units)
  const largeUnitScore = avgSize;

  // Combine scores (adjust weights as needed)
  return (aggressiveUnitScore * 0.3 + frontConcentrationScore * 0.25 + compactnessScore * 0.15 + lowRangedScore * 0.2 + largeUnitScore * 0.1) * 100;
};