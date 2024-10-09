import { Unit } from '../designer-types';
import { countUnitTypes, analyzePositions, averageUnitSize, calculateSpreadScore } from '../utils/plan-utils';

export const units: Unit[] = [
  // Main tank thrust (reduced from 4 to 3 units)
  { id: 501, col: -4, row: 2, sizeCol: 4, sizeRow: 4, type: 'tank', command: 'charge' },
  { id: 502, col: 4, row: 2, sizeCol: 4, sizeRow: 4, type: 'tank', command: 'charge' },
  { id: 503, col: 0, row: 0, sizeCol: 4, sizeRow: 4, type: 'tank', command: 'charge' },
  
  // Fast-moving warrior support (reduced from 3 to 2 units)
  { id: 504, col: -10, row: -2, sizeCol: 6, sizeRow: 2, type: 'warrior', command: 'rush' },
  { id: 505, col: 10, row: -2, sizeCol: 6, sizeRow: 2, type: 'warrior', command: 'rush' },
  
  // Mobile artillery (reduced from 2 to 1 unit)
  { id: 506, col: 0, row: -6, sizeCol: 8, sizeRow: 2, type: 'artillery', command: 'advance-fire' },
  
  // Fast-moving archer support (kept 2 units)
  { id: 507, col: -16, row: -8, sizeCol: 4, sizeRow: 2, type: 'archer', command: 'harass' },
  { id: 508, col: 16, row: -8, sizeCol: 4, sizeRow: 2, type: 'archer', command: 'harass' },
];

export const name = 'Blitzkrieg';

export const probabilityScore = (playerUnits: Unit[]): number => {
  const playerUnitCounts = countUnitTypes(playerUnits);
  const playerPositions = analyzePositions(playerUnits);
  const spreadScore = calculateSpreadScore(playerUnits);
  const avgSize = averageUnitSize(playerUnits);

  // Favor this plan when the enemy has a low proportion of tanks (harder to counter our tank thrust)
  const lowTankScore = 1 - (playerUnitCounts.tank / playerUnits.length);

  // Favor this plan when the enemy is more centralized (easier to break through)
  const centralizationScore = 1 - (playerPositions.left + playerPositions.right) / 2;

  // Favor this plan when the enemy units are less spread out (easier to overwhelm)
  const compactnessScore = 1 - spreadScore;

  // Slightly favor this plan against smaller units (easier to overwhelm)
  const smallUnitScore = 1 - avgSize;

  // Favor this plan when there's a high proportion of enemy units at the front (vulnerable to our fast attack)
  const frontlineScore = playerPositions.front;

  // Combine scores (adjust weights as needed)
  return (lowTankScore * 0.25 + centralizationScore * 0.2 + compactnessScore * 0.2 + smallUnitScore * 0.15 + frontlineScore * 0.2) * 100;
};