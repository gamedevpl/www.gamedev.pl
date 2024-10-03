import { Unit } from '../designer-screen';

export const units: Unit[] = [
  { id: 801, col: -16, row: -4, sizeCol: 4, sizeRow: 2, type: 'archer', command: 'wait' },
  { id: 802, col: -8, row: -4, sizeCol: 4, sizeRow: 2, type: 'archer', command: 'wait' },
  { id: 803, col: 0, row: -4, sizeCol: 4, sizeRow: 2, type: 'archer', command: 'wait' },
  { id: 804, col: 8, row: -4, sizeCol: 4, sizeRow: 2, type: 'archer', command: 'wait' },
  { id: 805, col: 16, row: -4, sizeCol: 4, sizeRow: 2, type: 'archer', command: 'wait' },
  { id: 806, col: -12, row: -10, sizeCol: 4, sizeRow: 4, type: 'tank', command: 'advance' },
  { id: 807, col: 12, row: -10, sizeCol: 4, sizeRow: 4, type: 'tank', command: 'advance' },
  { id: 808, col: 0, row: -14, sizeCol: 8, sizeRow: 1, type: 'artillery', command: 'wait' },
];

export const name = 'Archer Ambush';

export const probabilityScore = (playerUnits: Unit[]): number => {
  const playerUnitCounts = countUnitTypes(playerUnits);
  const playerPositions = analyzePositions(playerUnits);

  // Composition score (favor this plan when there are more melee units like warriors and tanks)
  const meleeUnitRatio = (playerUnitCounts.warrior + playerUnitCounts.tank) / playerUnits.length;
  const compositionScore = Math.min(meleeUnitRatio * 1.5, 1); // Cap at 1 for 66% or more melee units

  // Position score (favor this plan if player units are advancing, i.e., more units in the center and front)
  const positionScore = playerPositions.center + playerPositions.front * 0.5;

  // Size score (favor this plan against medium to large units)
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

function analyzePositions(units: Unit[]): { left: number; center: number; right: number; front: number } {
  const positions = { left: 0, center: 0, right: 0, front: 0 };
  units.forEach((unit) => {
    if (unit.col < -5) positions.left++;
    else if (unit.col > 5) positions.right++;
    else positions.center++;

    if (unit.row > -5) positions.front++;
  });
  const total = units.length;
  return {
    left: positions.left / total,
    center: positions.center / total,
    right: positions.right / total,
    front: positions.front / total,
  };
}

function averageUnitSize(units: Unit[]): number {
  if (units.length === 0) return 0;
  const totalSize = units.reduce((sum, unit) => sum + unit.sizeCol * unit.sizeRow, 0);
  return totalSize / (units.length * 16); // Normalize to [0, 1] assuming max size is 4x4
}
