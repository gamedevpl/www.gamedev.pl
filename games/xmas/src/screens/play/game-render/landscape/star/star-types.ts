// Star configuration
export const STARS = {
  COUNT: 100, // Number of stars
  MIN_SIZE: 1, // Minimum star size in pixels
  MAX_SIZE: 2, // Maximum star size in pixels
  TWINKLE_SPEED: 0.0001, // How fast stars twinkle
  COLOR: '#FFFFFF', // Star color
  MIN_BRIGHTNESS: 0.3, // Minimum star brightness
  MAX_BRIGHTNESS: 1.0, // Maximum star brightness
  SKY_HEIGHT_RATIO: 0.7, // Stars only in upper 70% of sky
} as const;

// Star type definition
export type Star = {
  x: number; // x position
  y: number; // y position
  size: number; // Size of the star
  twinkle: number; // Current twinkle phase (0-1)
};

// Star state type
export type StarState = {
  stars: Star[];
  time: number; // For animations (star twinkling)
};
