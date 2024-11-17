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
  vx: number;
  vy: number;
  radius: number;
  angle: number;
  state: 'charging' | 'flying' | 'exploding';
  // Intensity controls the overall brightness of the fireball
  // Values range from 0.0 to 1.0, where 1.0 is full brightness
  intensity: number;
  // Glow factor controls how much the fireball illuminates its surroundings
  // Values range from 0.0 to 1.0, where higher values create stronger glow
  glow: number;
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