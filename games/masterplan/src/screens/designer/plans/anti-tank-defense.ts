import { Unit } from '../designer-screen';

export const units: Unit[] = [
  { id: 301, col: -16, row: 0, sizeCol: 4, sizeRow: 2, type: 'archer', command: 'wait-advance' },
  { id: 302, col: 16, row: 0, sizeCol: 4, sizeRow: 2, type: 'archer', command: 'wait-advance' },
  { id: 303, col: 0, row: -4, sizeCol: 8, sizeRow: 4, type: 'artillery', command: 'advance-wait' },
  { id: 304, col: -12, row: -2, sizeCol: 8, sizeRow: 2, type: 'warrior', command: 'advance' },
  { id: 305, col: 12, row: -2, sizeCol: 8, sizeRow: 2, type: 'warrior', command: 'advance' },
  { id: 306, col: -8, row: -6, sizeCol: 4, sizeRow: 4, type: 'tank', command: 'advance' },
  { id: 307, col: 8, row: -6, sizeCol: 4, sizeRow: 4, type: 'tank', command: 'advance' },
  { id: 308, col: 0, row: -10, sizeCol: 8, sizeRow: 1, type: 'artillery', command: 'wait' },
];

export const name = 'Anti-Tank Defense';

export const probabilityScore = (playerUnits: Unit[]): number => {
  const playerUnitCounts = countUnitTypes(playerUnits);
  const playerPositions = analyzePositions(playerUnits);

  // Composition score (favor this plan when there are more tanks)
  const tankRatio = playerUnitCounts.tank / playerUnits.length;
  const compositionScore = Math.min(tankRatio * 2, 1); // Cap at 1 for 50% or more tanks

  // Position score (favor this plan if player units are concentrated in the center)
  const positionScore = playerPositions.center;

  // Size score (favor this plan against larger units, especially tanks)
  const sizeScore = averageUnitSize(playerUnits.filter((unit) => unit.type === 'tank'));

  // Combine scores (you can adjust weights as needed)
  return (compositionScore * 0.5 + positionScore * 0.3 + sizeScore * 0.2) * 100;
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
