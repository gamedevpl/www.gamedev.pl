import { Unit } from '../designer-screen';

export const units: Unit[] = [
  { id: 701, col: -16, row: -4, sizeCol: 8, sizeRow: 4, type: 'artillery', command: 'advance' },
  { id: 702, col: 16, row: -4, sizeCol: 8, sizeRow: 4, type: 'artillery', command: 'advance' },
  { id: 703, col: 0, row: 0, sizeCol: 8, sizeRow: 4, type: 'tank', command: 'advance-wait' },
  { id: 704, col: -8, row: -10, sizeCol: 4, sizeRow: 2, type: 'archer', command: 'wait' },
  { id: 705, col: 8, row: -10, sizeCol: 4, sizeRow: 2, type: 'archer', command: 'wait' },
  { id: 706, col: -12, row: -12, sizeCol: 4, sizeRow: 4, type: 'tank', command: 'advance' },
  { id: 707, col: 12, row: -12, sizeCol: 4, sizeRow: 4, type: 'tank', command: 'advance' },
  { id: 708, col: 0, row: -14, sizeCol: 8, sizeRow: 1, type: 'artillery', command: 'wait' },
];

export const name = 'Artillery Strike';

export const probabilityScore = (playerUnits: Unit[]): number => {
  const playerUnitCounts = countUnitTypes(playerUnits);
  const playerPositions = analyzePositions(playerUnits);

  // Composition score (favor this plan when there are more slow-moving units like tanks and artillery)
  const slowUnitRatio = (playerUnitCounts.tank + playerUnitCounts.artillery) / playerUnits.length;
  const compositionScore = Math.min(slowUnitRatio * 2, 1); // Cap at 1 for 50% or more slow units

  // Position score (favor this plan if player units are concentrated)
  const positionScore = Math.max(playerPositions.left, playerPositions.center, playerPositions.right);

  // Size score (favor this plan against larger units)
  const sizeScore = averageUnitSize(playerUnits);

  // Combine scores (you can adjust weights as needed)
  return (compositionScore * 0.4 + positionScore * 0.4 + sizeScore * 0.2) * 100;
};

function countUnitTypes(units: Unit[]): Record<string, number> {
  return units.reduce((acc, unit) => {
    acc[unit.type] = (acc[unit.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
}

function analyzePositions(units: Unit[]): { left: number; center: number; right: number } {
  const positions = { left: 0, center: 0, right: 0 };
  units.forEach((unit) => {
    if (unit.col < -5) positions.left++;
    else if (unit.col > 5) positions.right++;
    else positions.center++;
  });
  const total = units.length;
  return {
    left: positions.left / total,
    center: positions.center / total,
    right: positions.right / total,
  };
}

function averageUnitSize(units: Unit[]): number {
  if (units.length === 0) return 0;
  const totalSize = units.reduce((sum, unit) => sum + unit.sizeCol * unit.sizeRow, 0);
  return totalSize / (units.length * 16); // Normalize to [0, 1] assuming max size is 4x4
}
