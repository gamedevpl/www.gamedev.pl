export type BattleState = {
  time: Time;
  units: Unit[];
  missiles: Missile[];
  effects: Effect[];
  arena: ArenaDimensions; // New property for arena dimensions
};

export type ArenaDimensions = {
  width: number;
  height: number;
};

export type Unit = {
  id: UnitId;
  commanderId: UnitId;
  side: SideType;
  type: UnitType;
  position: Position;
  health: number; // 0 means dead
  commanderOrder?: CommanderOrder;
};

export type Missile = {
  id: MissileId;
  type: MissileType;
  position: Position;
  velocity: Vector;
};

export type Effect = {
  position: Position;
  type: EffectType;
  startTime: Time;
  endTime: Time;
};

export type UnitType = 'warrior' | 'archer' | 'tank' | 'artillery' | 'cavalry' | 'commander';

export type MissileType = 'arrow' | 'bomb';

export type EffectType = 'damage' | 'explosion' | 'walk';

export type SideType = 'red' | 'blue';

export type CommanderOrder = {
  formationCenter: Position;
  formationWidth: number;
  formationHeight: number;
};

export type UnitId = string;
export type MissileId = string;
export type EffectId = string;

export type Position = {
  x: number;
  y: number;
  z: number;
};

export type Vector = Position;

export type Time = number;
