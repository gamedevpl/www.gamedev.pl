import { Unit } from '../designer-screen';

export const units: Unit[] = [
  { id: 501, col: -12, row: 0, sizeCol: 8, sizeRow: 2, type: 'warrior', command: 'advance' },
  { id: 502, col: 12, row: 0, sizeCol: 8, sizeRow: 2, type: 'warrior', command: 'advance' },
  { id: 503, col: -8, row: -4, sizeCol: 4, sizeRow: 2, type: 'archer', command: 'flank-left' },
  { id: 504, col: 8, row: -4, sizeCol: 4, sizeRow: 2, type: 'archer', command: 'flank-right' },
  { id: 505, col: -16, row: -2, sizeCol: 8, sizeRow: 2, type: 'warrior', command: 'advance' },
  { id: 506, col: 16, row: -2, sizeCol: 8, sizeRow: 2, type: 'warrior', command: 'advance' },
  { id: 507, col: 0, row: -6, sizeCol: 8, sizeRow: 4, type: 'artillery', command: 'wait' },
  { id: 508, col: 0, row: -10, sizeCol: 8, sizeRow: 1, type: 'artillery', command: 'wait' },
];

export const name = 'Warrior Blitz';

export const probabilityScore = (playerUnits: Unit[]): number => {
  const playerUnitCounts = countUnitTypes(playerUnits);
  const playerPositions = analyzePositions(playerUnits);

  // Composition score (favor this plan when there are fewer tanks and more small units)
  const tankRatio = playerUnitCounts.tank / playerUnits.length;
  const smallUnitRatio = (playerUnitCounts.warrior + playerUnitCounts.archer) / playerUnits.length;
  const compositionScore = (1 - tankRatio) * 0.5 + smallUnitRatio * 0.5;

  // Position score (favor this plan if player units are concentrated in the center)
  const positionScore = playerPositions.center;

  // Size score (favor this plan against smaller units)
  const sizeScore = 1 - averageUnitSize(playerUnits);

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
