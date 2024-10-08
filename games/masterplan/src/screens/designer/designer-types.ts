export interface Unit {
  id: number;
  col: number;
  row: number;
  sizeCol: number;
  sizeRow: number;
  type: UnitType;
  command: string;
}

export type UnitType = 'warrior' | 'archer' | 'tank' | 'artillery';

export function rotateUnits(units: Unit[]): Unit[] {
  return units.map((unit) => ({
    ...unit,
    col: -unit.col,
    row: -unit.row,
  }));
}
