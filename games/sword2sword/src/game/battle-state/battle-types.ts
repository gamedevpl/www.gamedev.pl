export type Position = { x: number; y: number; z: number };

export type BattleState = {
  characters: CharacterState;
  arenaState: ArenaState;
};

export type CharacterState = {
  position: Position;
};

export type ArenaState = {
  width: number;
  height: number;
};
