import { Unit } from '../designer-types';

export function countUnitTypes(units: Unit[]): { tank: number; warrior: number; archer: number; artillery: number } {
  return units.reduce(
    (acc, unit) => {
      acc[unit.type] = (acc[unit.type] || 0) + 1;
      return acc;
    },
    { tank: 0, warrior: 0, archer: 0, artillery: 0 },
  );
}

export function analyzePositions(units: Unit[]): { left: number; center: number; right: number; front: number } {
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

export function averageUnitSize(units: Unit[]): number {
  if (units.length === 0) return 0;
  const totalSize = units.reduce((sum, unit) => sum + unit.sizeCol * unit.sizeRow, 0);
  return totalSize / (units.length * 16); // Normalize to [0, 1] assuming max size is 4x4
}

export function calculateSpreadScore(units: Unit[]): number {
  const positions = units.map((unit) => ({ x: unit.col, y: unit.row }));
  const centerX = positions.reduce((sum, pos) => sum + pos.x, 0) / positions.length;
  const centerY = positions.reduce((sum, pos) => sum + pos.y, 0) / positions.length;

  const maxDistance = Math.sqrt(32 * 32 + 18 * 18); // Assuming 32x18 grid
  const avgDistance =
    positions.reduce((sum, pos) => {
      const dx = pos.x - centerX;
      const dy = pos.y - centerY;
      return sum + Math.sqrt(dx * dx + dy * dy);
    }, 0) / positions.length;

  return avgDistance / maxDistance; // Normalized to [0, 1]
}

export function getFormations(sizeCol: number, sizeRow: number) {
  const totalSize = sizeCol * sizeRow;
  return [
    { sizeCol: totalSize, sizeRow: 1 },
    ...Array.from({ length: totalSize - 1 }, (_, i) => ({
      sizeCol: i + 1,
      sizeRow: Math.ceil(totalSize / (i + 1)),
    })).filter((formation) => formation.sizeCol * formation.sizeRow <= totalSize),
    { sizeCol: 1, sizeRow: totalSize },
  ];
}
