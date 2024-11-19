export type GameWorldState = {
  time: number;
  santas: Santa[];
  gifts: Gift[];
  chimneys: Chimney[];
  fireballs: Fireball[];
};

export type Santa = {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  direction: 'left' | 'right';
};

export type Fireball = {
  id: string;
  x: number;
  y: number;
  radius: number;
  createdAt: number; // timestamp when fireball was created
  vx: number;
  vy: number;
};

export type Gift = {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
};

export type Chimney = {
  id: string;
  x: number;
  y: number;
};
