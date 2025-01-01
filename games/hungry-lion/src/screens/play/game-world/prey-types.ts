export const PREY_WIDTH = 30;
export const PREY_HEIGHT = 30;
export const PREY_SPEED = 100; // units per second

export type PreyState = {
  id: string;
  position: {
    x: number;
    y: number;
  };
  movement: {
    direction: {
      x: number;
      y: number;
    };
    speed: number;
  };
  state: 'idle' | 'moving' | 'fleeing';
};

export type PreySpawnConfig = {
  initialCount: number;
  spawnInterval: number;
  maxCount: number;
};
