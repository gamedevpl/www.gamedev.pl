import { Unit } from '../designer-screen';

export const units: Unit[] = [
  { id: 201, col: -12, row: 0, sizeCol: 8, sizeRow: 2, type: 'warrior', command: 'advance-wait' },
  { id: 202, col: 0, row: 0, sizeCol: 8, sizeRow: 2, type: 'warrior', command: 'advance-wait' },
  { id: 203, col: 12, row: 0, sizeCol: 8, sizeRow: 2, type: 'warrior', command: 'advance-wait' },
  { id: 204, col: -8, row: -4, sizeCol: 4, sizeRow: 4, type: 'tank', command: 'advance' },
  { id: 205, col: 8, row: -4, sizeCol: 4, sizeRow: 4, type: 'tank', command: 'advance' },
  { id: 206, col: -16, row: -8, sizeCol: 4, sizeRow: 2, type: 'archer', command: 'wait-advance' },
  { id: 207, col: 16, row: -8, sizeCol: 4, sizeRow: 2, type: 'archer', command: 'wait-advance' },
  { id: 208, col: 0, row: -10, sizeCol: 8, sizeRow: 1, type: 'artillery', command: 'wait' },
];

export const name = 'Balanced Assault';

export const probabilityScore = (playerUnits: Unit[]): number => {
  const playerUnitCounts = countUnitTypes(playerUnits);
  const playerPositions = analyzePositions(playerUnits);

  // Balanced composition score
  const compositionScore =
    1 -
    Math.abs(0.25 - playerUnitCounts.warrior / playerUnits.length) -
    Math.abs(0.25 - playerUnitCounts.archer / playerUnits.length) -
    Math.abs(0.25 - playerUnitCounts.tank / playerUnits.length) -
    Math.abs(0.25 - playerUnitCounts.artillery / playerUnits.length);

  // Position score (favor this plan if player units are spread out)
  const positionScore = (playerPositions.left + playerPositions.right + playerPositions.center) / 3;

  // Size score (favor this plan against average-sized units)
  const sizeScore = 1 - Math.abs(0.5 - averageUnitSize(playerUnits));

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
  const totalSize = units.reduce((sum, unit) => sum + unit.sizeCol * unit.sizeRow, 0);
  return totalSize / (units.length * 16); // Normalize to [0, 1] assuming max size is 4x4
}
