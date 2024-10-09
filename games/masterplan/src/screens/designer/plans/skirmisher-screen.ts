import { Unit } from '../designer-types';
import { countUnitTypes, analyzePositions, averageUnitSize, calculateSpreadScore } from '../utils/plan-utils';

export const units: Unit[] = [
  // Skirmisher screen (Archers) - reduced from 5 to 4 units
  { id: 1201, col: -12, row: 2, sizeCol: 3, sizeRow: 2, type: 'archer', command: 'harass-retreat' },
  { id: 1202, col: -4, row: 2, sizeCol: 3, sizeRow: 2, type: 'archer', command: 'harass-retreat' },
  { id: 1203, col: 4, row: 2, sizeCol: 3, sizeRow: 2, type: 'archer', command: 'harass-retreat' },
  { id: 1204, col: 12, row: 2, sizeCol: 3, sizeRow: 2, type: 'archer', command: 'harass-retreat' },
  
  // Mobile support (Warriors) - reduced from 3 to 2 units
  { id: 1205, col: -8, row: -2, sizeCol: 6, sizeRow: 2, type: 'warrior', command: 'mobile-support' },
  { id: 1206, col: 8, row: -2, sizeCol: 6, sizeRow: 2, type: 'warrior', command: 'mobile-support' },
  
  // Main force (Tanks) - reduced from 3 to 2 units
  { id: 1207, col: -6, row: -6, sizeCol: 4, sizeRow: 4, type: 'tank', command: 'advance-cautiously' },
  { id: 1208, col: 6, row: -6, sizeCol: 4, sizeRow: 4, type: 'tank', command: 'advance-cautiously' },
  
  // Long-range support (Artillery) - kept 2 units
  { id: 1209, col: -8, row: -10, sizeCol: 6, sizeRow: 2, type: 'artillery', command: 'selective-fire' },
  { id: 1210, col: 8, row: -10, sizeCol: 6, sizeRow: 2, type: 'artillery', command: 'selective-fire' },
];

export const name = 'Skirmisher Screen';

export const probabilityScore = (playerUnits: Unit[]): number => {
  const playerUnitCounts = countUnitTypes(playerUnits);
  const playerPositions = analyzePositions(playerUnits);
  const spreadScore = calculateSpreadScore(playerUnits);
  const avgSize = averageUnitSize(playerUnits);

  // Favor this plan when the enemy has a high proportion of slow, heavy units (tanks and artillery)
  const heavyUnitScore = (playerUnitCounts.tank + playerUnitCounts.artillery) / playerUnits.length;

  // Favor this plan when the enemy formation is more spread out (easier to harass)
  const enemySpreadScore = spreadScore;

  // Favor this plan when enemy units are larger (easier targets for skirmishers)
  const largeUnitScore = avgSize;

  // Slightly favor this plan when there's a lower proportion of enemy archers (less counter-harassment)
  const lowArcherScore = 1 - (playerUnitCounts.archer / playerUnits.length);

  // Favor this plan when enemy units are more concentrated at the front (vulnerable to harassment)
  const frontConcentrationScore = playerPositions.front;

  // Slightly favor this plan when the enemy has a lower proportion of warriors (less threat to our skirmishers)
  const lowWarriorScore = 1 - (playerUnitCounts.warrior / playerUnits.length);

  // Combine scores (adjust weights as needed)
  return (heavyUnitScore * 0.25 + enemySpreadScore * 0.2 + largeUnitScore * 0.15 + 
          lowArcherScore * 0.15 + frontConcentrationScore * 0.15 + lowWarriorScore * 0.1) * 100;
};