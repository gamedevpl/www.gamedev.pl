import { Unit } from '../designer-types';
import { countUnitTypes, analyzePositions, averageUnitSize, calculateSpreadScore } from '../utils/plan-utils';

export const units: Unit[] = [
  // Front shell (Warriors) - reduced from 3 to 2 units
  { id: 1101, col: -6, row: 2, sizeCol: 6, sizeRow: 2, type: 'warrior', command: 'defend-front' },
  { id: 1102, col: 6, row: 2, sizeCol: 6, sizeRow: 2, type: 'warrior', command: 'defend-front' },
  
  // Left and right shell (Warriors) - reduced from 4 to 2 units
  { id: 1103, col: -8, row: -2, sizeCol: 6, sizeRow: 2, type: 'warrior', command: 'defend-left' },
  { id: 1104, col: 8, row: -2, sizeCol: 6, sizeRow: 2, type: 'warrior', command: 'defend-right' },
  
  // Rear shell (Warriors) - reduced from 3 to 2 units
  { id: 1105, col: -6, row: -6, sizeCol: 6, sizeRow: 2, type: 'warrior', command: 'defend-rear' },
  { id: 1106, col: 6, row: -6, sizeCol: 6, sizeRow: 2, type: 'warrior', command: 'defend-rear' },
  
  // Internal tanks for breakthrough capability - kept 2 units
  { id: 1107, col: -3, row: -2, sizeCol: 3, sizeRow: 3, type: 'tank', command: 'hold-center' },
  { id: 1108, col: 3, row: -2, sizeCol: 3, sizeRow: 3, type: 'tank', command: 'hold-center' },
  
  // Internal archers for ranged support - kept 2 units
  { id: 1109, col: -4, row: -4, sizeCol: 3, sizeRow: 2, type: 'archer', command: 'fire-at-will' },
  { id: 1110, col: 4, row: -4, sizeCol: 3, sizeRow: 2, type: 'archer', command: 'fire-at-will' },
  
  // Central artillery for long-range support - kept 1 unit
  { id: 1111, col: 0, row: -4, sizeCol: 4, sizeRow: 2, type: 'artillery', command: 'bombard-defensive' },
];

export const name = 'Turtle Formation';

export const probabilityScore = (playerUnits: Unit[]): number => {
  const playerUnitCounts = countUnitTypes(playerUnits);
  const playerPositions = analyzePositions(playerUnits);
  const spreadScore = calculateSpreadScore(playerUnits);
  const avgSize = averageUnitSize(playerUnits);

  // Favor this plan when the enemy has a high proportion of melee units (warriors and tanks)
  const meleeUnitScore = (playerUnitCounts.warrior + playerUnitCounts.tank) / playerUnits.length;

  // Favor this plan when the enemy formation is more concentrated (our turtle can withstand focused attacks)
  const concentrationScore = 1 - spreadScore;

  // Slightly favor this plan when enemy units are larger (our defensive formation can outlast them)
  const largeUnitScore = avgSize;

  // Favor this plan when there's a lower proportion of enemy artillery (less threat to our tight formation)
  const lowArtilleryScore = 1 - (playerUnitCounts.artillery / playerUnits.length);

  // Slightly disfavor this plan if the enemy has a high proportion of ranged units
  const lowRangedScore = 1 - ((playerUnitCounts.artillery + playerUnitCounts.archer) / playerUnits.length);

  // Slightly favor this plan when enemy units are more concentrated at the front (can withstand frontal assault)
  const frontConcentrationScore = playerPositions.front;

  // Combine scores (adjust weights as needed)
  return (meleeUnitScore * 0.25 + concentrationScore * 0.2 + largeUnitScore * 0.15 + 
          lowArtilleryScore * 0.2 + lowRangedScore * 0.1 + frontConcentrationScore * 0.1) * 100;
};