import { Unit } from '../designer-types';
import { countUnitTypes, analyzePositions, averageUnitSize } from '../utils/plan-utils';

export const units: Unit[] = [
  // Tanks to absorb damage and push through (2 units)
  { id: 301, col: -6, row: 0, sizeCol: 4, sizeRow: 4, type: 'tank', command: 'advance' },
  { id: 302, col: 6, row: 0, sizeCol: 4, sizeRow: 4, type: 'tank', command: 'advance' },

  // Warriors to close in on artillery (4 units)
  { id: 303, col: -8, row: -4, sizeCol: 2, sizeRow: 2, type: 'warrior', command: 'advance' },
  { id: 304, col: -4, row: -4, sizeCol: 2, sizeRow: 2, type: 'warrior', command: 'advance' },
  { id: 305, col: 4, row: -4, sizeCol: 2, sizeRow: 2, type: 'warrior', command: 'advance' },
  { id: 306, col: 8, row: -4, sizeCol: 2, sizeRow: 2, type: 'warrior', command: 'advance' },

  // Archers for ranged support (2 units)
  { id: 307, col: -10, row: -8, sizeCol: 4, sizeRow: 2, type: 'archer', command: 'wait-advance' },
  { id: 308, col: 10, row: -8, sizeCol: 4, sizeRow: 2, type: 'archer', command: 'wait-advance' },

  // Artillery for counter-battery fire (2 units)
  { id: 309, col: -12, row: -10, sizeCol: 8, sizeRow: 1, type: 'artillery', command: 'wait' },
  { id: 310, col: 12, row: -10, sizeCol: 8, sizeRow: 1, type: 'artillery', command: 'wait' },
];

export const name = 'Artillery Counter';

export const probabilityScore = (playerUnits: Unit[]): number => {
  const playerUnitCounts = countUnitTypes(playerUnits);
  const playerPositions = analyzePositions(playerUnits);

  // High score if the enemy has a lot of artillery
  const artilleryScore = Math.min(playerUnitCounts.artillery / playerUnits.length, 0.5) * 2;

  // Bonus for centralized enemy positions (easier to surround)
  const positionScore = playerPositions.center;

  // Prefer this plan against larger units (artillery and tanks are usually larger)
  const sizeScore = averageUnitSize(playerUnits);

  // Adjust the weight of artilleryScore slightly
  return (artilleryScore * 0.6 + positionScore * 0.2 + sizeScore * 0.2) * 100 + 100;
};
