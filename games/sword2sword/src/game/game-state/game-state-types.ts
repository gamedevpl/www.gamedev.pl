export enum WarriorAction {
  NONE,
  MOVE_LEFT,
  MOVE_RIGHT,
}

export type WarriorInput = {
  actionEnabled: Partial<Record<WarriorAction, boolean>>;
};

export type GameInput = {
  playerIndex: number;
  input: WarriorInput;
};

export type GameState = {
  time: number;
  warriors: WarriorState[];
};

export type WarriorState = {
  position: number;
};
