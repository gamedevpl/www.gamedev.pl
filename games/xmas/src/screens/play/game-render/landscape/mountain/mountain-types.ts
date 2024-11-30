import { GAME_WORLD_HEIGHT } from '../../../game-world/game-world-consts';

// Mountain silhouette colors
export const MOUNTAIN_COLORS = {
  BACK: '#000066', // Distant mountains
  MIDDLE: '#000044', // Mid-distance mountains
  FRONT: '#000022', // Foreground mountains
} as const;

// Mountain configuration
export const MOUNTAINS = {
  LAYERS: 3, // Number of mountain layers for depth
  MAX_HEIGHT: GAME_WORLD_HEIGHT * 0.4, // Maximum mountain height
  MIN_HEIGHT: GAME_WORLD_HEIGHT * 0.2, // Minimum mountain height
  PEAKS: {
    BACK: 3, // Number of peaks in back layer
    MIDDLE: 4, // Number of peaks in middle layer
    FRONT: 5, // Number of peaks in front layer
  },
  JAGGEDNESS: 0.3, // How jagged the mountains appear (0-1)
} as const;

// Mountain type definition
export type Mountain = {
  x: number; // Base x position
  height: number; // Height of the mountain
  width: number; // Width of the mountain
  layer: number; // Which layer (0 = back, 2 = front)
  points: Array<{ x: number; y: number }>; // Points defining the mountain shape
};

// Mountain state type
export type MountainState = {
  mountains: Mountain[];
};
