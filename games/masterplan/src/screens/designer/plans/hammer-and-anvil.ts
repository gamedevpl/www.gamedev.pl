import { Unit } from '../designer-types';
import { countUnitTypes, analyzePositions, averageUnitSize, calculateSpreadScore } from '../utils/plan-utils';

export const units: Unit[] = [
  // Anvil: Strong frontal assault (reduced from 3 to 2 warrior units)
  { id: 901, col: -8, row: 0, sizeCol: 8, sizeRow: 2, type: 'warrior', command: 'hold-line' },
  { id: 902, col: 8, row: 0, sizeCol: 8, sizeRow: 2, type: 'warrior', command: 'hold-line' },
  { id: 903, col: -4, row: -2, sizeCol: 4, sizeRow: 4, type: 'tank', command: 'support-front' },
  { id: 904, col: 4, row: -2, sizeCol: 4, sizeRow: 4, type: 'tank', command: 'support-front' },

  // Hammer: Flanking mobile units (reduced from 2 to 1 tank on each side)
  { id: 905, col: -16, row: -4, sizeCol: 4, sizeRow: 4, type: 'tank', command: 'flank-left' },
  { id: 906, col: -20, row: -6, sizeCol: 6, sizeRow: 2, type: 'warrior', command: 'flank-left' },
  { id: 907, col: 16, row: -4, sizeCol: 4, sizeRow: 4, type: 'tank', command: 'flank-right' },
  { id: 908, col: 20, row: -6, sizeCol: 6, sizeRow: 2, type: 'warrior', command: 'flank-right' },

  // Ranged support
  { id: 909, col: -12, row: -6, sizeCol: 4, sizeRow: 2, type: 'archer', command: 'support-left' },
  { id: 910, col: 12, row: -6, sizeCol: 4, sizeRow: 2, type: 'archer', command: 'support-right' },
  { id: 911, col: 0, row: -8, sizeCol: 6, sizeRow: 2, type: 'artillery', command: 'bombard-center' },
];

export const name = 'Hammer and Anvil';

export const probabilityScore = (playerUnits: Unit[]): number => {
  const playerUnitCounts = countUnitTypes(playerUnits);
  const playerPositions = analyzePositions(playerUnits);
  const spreadScore = calculateSpreadScore(playerUnits);
  const avgSize = averageUnitSize(playerUnits);

  // Favor this plan when the enemy has a strong central presence (vulnerable to our flanking)
  const centralizationScore = 1 - (playerPositions.left + playerPositions.right) / 2;

  // Favor this plan when the enemy has a high proportion of melee units (warriors and tanks)
  const meleeUnitScore = (playerUnitCounts.warrior + playerUnitCounts.tank) / playerUnits.length;

  // Slightly favor this plan when enemy units are less spread out (easier to pin down with our anvil)
  const compactnessScore = 1 - spreadScore;

  // Favor this plan when there's a high proportion of enemy units at the front (vulnerable to our anvil)
  const frontlineScore = playerPositions.front;

  // Slightly favor this plan against larger units (easier to surround and flank)
  const largeUnitScore = avgSize;

  // Slightly disfavor this plan if the enemy has a high proportion of ranged units
  const lowRangedScore = 1 - ((playerUnitCounts.artillery + playerUnitCounts.archer) / playerUnits.length);

  // Combine scores (adjust weights as needed)
  return (centralizationScore * 0.25 + meleeUnitScore * 0.2 + compactnessScore * 0.15 + 
          frontlineScore * 0.2 + largeUnitScore * 0.1 + lowRangedScore * 0.1) * 100;
};