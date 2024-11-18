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
  vx?: number; // optional horizontal velocity
  vy?: number; // optional vertical velocity
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

// Helper function to create a new fireball
export function createFireball(x: number, y: number, radius: number): Fireball {
  return {
    id: `fireball_${Date.now()}_${Math.random()}`,
    x,
    y,
    radius,
    createdAt: Date.now(),
    vx: 0,
    vy: 0,
  };
}
