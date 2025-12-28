export type Vector2D = {
  x: number;
  y: number;
};

export type Rect2D = Vector2D & {
  width: number;
  height: number;
};

export type Circle2D = Vector2D & {
  radius: number;
};
