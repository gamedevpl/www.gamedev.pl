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

export type Vector2D = {
  x: number;
  y: number;
};

export type WarriorState = {
  position: Vector2D;
  vertices: Vector2D[];
};

export type GameState = {
  time: number;
  warriors: WarriorState[];
};
