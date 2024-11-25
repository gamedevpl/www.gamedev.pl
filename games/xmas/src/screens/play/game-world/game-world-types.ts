export const enum SANTA_PHYSICS {
  MAX_VELOCITY = 1.0,
  MIN_VELOCITY = -1.0,
  ACCELERATION = 0.0005,
  DECELERATION = 0.002,
  MAX_ROTATION_SPEED = 0.0021,
  ROTATION_ACCELERATION = 0.0001,
  ROTATION_DECELERATION = 0.00005,
  MAX_ENERGY = 100,
  ENERGY_REGENERATION = 0.01,
  FIREBALL_ENERGY_COST = 10,
  CHARGE_ENERGY_DRAIN_RATE = 0.02,
  MIN_HEIGHT = 100.1,
  MAX_HEIGHT = 900,
}

export const enum FIREBALL_PHYSICS {
  BASE_VELOCITY = 0.5,
  MIN_RADIUS = 30,
  GROWTH_RATE = 30.1,
  MIN_CHARGE_TIME = 1000,
  MAX_CHARGE_TIME = 5000,
  ENERGY_TO_SIZE_RATIO = 0.25,
  ENERGY_TO_VELOCITY_RATIO = 0.001,
}

export type SantaInputState = {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  charging: boolean;
  chargeStartTime: number | null;
};

export type GameWorldState = {
  time: number;
  playerSanta: Santa;
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
  ax: number;
  ay: number;
  angle: number;
  angularVelocity: number;
  direction: 'left' | 'right';
  energy: number;
  energyRegenPaused: boolean;
  input: SantaInputState;
  isPlayer: boolean;
};

export type Fireball = {
  id: string;
  x: number;
  y: number;
  radius: number;
  createdAt: number;
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
