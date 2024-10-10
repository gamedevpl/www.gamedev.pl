import { Unit } from '../designer-types';
import { countUnitTypes, analyzePositions, averageUnitSize, calculateSpreadScore } from '../utils/plan-utils';

export const units: Unit[] = [
  // Lead element (Tank)
  { id: 1001, col: 12, row: 2, sizeCol: 4, sizeRow: 4, type: 'tank', command: 'advance' },

  // Echelon line (alternating Warriors and Tanks)
  { id: 1002, col: 8, row: 0, sizeCol: 6, sizeRow: 2, type: 'warrior', command: 'advance' },
  { id: 1003, col: 4, row: -2, sizeCol: 4, sizeRow: 4, type: 'tank', command: 'advance' },
  { id: 1004, col: 0, row: -4, sizeCol: 6, sizeRow: 2, type: 'warrior', command: 'advance' },
  { id: 1005, col: -4, row: -6, sizeCol: 4, sizeRow: 4, type: 'tank', command: 'advance' },
  { id: 1006, col: -8, row: -8, sizeCol: 6, sizeRow: 2, type: 'warrior', command: 'advance' },

  // Archer support along the echelon (reduced from 3 to 2 units)
  { id: 1007, col: 12, row: -4, sizeCol: 4, sizeRow: 2, type: 'archer', command: 'wait-advance' },
  { id: 1008, col: 0, row: -8, sizeCol: 4, sizeRow: 2, type: 'archer', command: 'wait-advance' },

  // Artillery support at the rear (reduced from 2 to 1 unit)
  { id: 1009, col: -16, row: -12, sizeCol: 6, sizeRow: 2, type: 'artillery', command: 'advance' },
];

export const name = 'Echelon Formation';

export const probabilityScore = (playerUnits: Unit[]): number => {
  const playerUnitCounts = countUnitTypes(playerUnits);
  const playerPositions = analyzePositions(playerUnits);
  const spreadScore = calculateSpreadScore(playerUnits);
  const avgSize = averageUnitSize(playerUnits);

  // Favor this plan when the enemy has a strong presence on one flank (our echelon can adapt)
  const flankImbalanceScore = Math.abs(playerPositions.left - playerPositions.right);

  // Favor this plan when the enemy has a balanced unit composition (our echelon is versatile)
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

  // Slightly favor this plan when enemy units are more spread out (our echelon can engage progressively)
  const spreadOutScore = spreadScore;

  // Favor this plan when there's a lower proportion of enemy artillery (less threat to our formation)
  const lowArtilleryScore = 1 - playerUnitCounts.artillery / playerUnits.length;

  // Slightly favor this plan against smaller units (our echelon can overwhelm them progressively)
  const smallUnitScore = 1 - avgSize;

  // Combine scores (adjust weights as needed)
  return (
    (flankImbalanceScore * 0.25 +
      compositionBalance * 0.2 +
      spreadOutScore * 0.2 +
      lowArtilleryScore * 0.25 +
      smallUnitScore * 0.1) *
    100
  );
};
