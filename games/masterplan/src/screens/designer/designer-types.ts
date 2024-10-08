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
