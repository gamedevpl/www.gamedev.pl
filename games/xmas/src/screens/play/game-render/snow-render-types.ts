import { GAME_WORLD_HEIGHT } from '../game-world/game-world-consts';

// Particle System Configuration
export const SNOW_PARTICLE_COUNT = 200; // Default number of particles
export const SNOW_PARTICLE_MIN_Z = 0; // Closest to camera
export const SNOW_PARTICLE_MAX_Z = 1000; // Furthest from camera
export const SNOW_PARTICLE_MIN_LIFETIME = 1000; // Minimum particle lifetime in ms
export const SNOW_PARTICLE_MAX_LIFETIME = 15000; // Maximum particle lifetime in ms

// Particle Size Configuration
export const SNOW_PARTICLE_BASE_SIZE = 3; // Base size in pixels
export const SNOW_PARTICLE_MIN_SIZE = 2; // Minimum size for distant particles
export const SNOW_PARTICLE_MAX_SIZE = 6; // Maximum size for close particles

// Movement Configuration
export const SNOW_BASE_FALL_SPEED = 0.1; // Pixels per second
export const SNOW_SPAWN_HEIGHT = -50; // Spawn above visible area
export const SNOW_DESPAWN_HEIGHT = GAME_WORLD_HEIGHT + 50; // Despawn below visible area

// Visual Configuration
export const SNOW_COLOR = {
  RED: 250,
  GREEN: 250,
  BLUE: 255,
  BASE_ALPHA: 0.8,
} as const;

// Particle Types
export type SnowParticle = {
  active: boolean; // Whether particle is currently in use
  x: number; // X coordinate
  y: number; // Y coordinate
  z: number; // Z coordinate (depth)
  vx: number; // X velocity (reserved for future use)
  vy: number; // Y velocity
  vz: number; // Z velocity (reserved for future use)
  size: number; // Current rendered size
  alpha: number; // Current opacity
  createdAt: number; // Timestamp when particle was created
  lifetime: number; // How long this particle should live
};

// Particle Pool Types
export type SnowParticlePool = {
  particles: SnowParticle[];
  activeCount: number;
};

// Helper type for particle initialization
export type ParticleInitOptions = {
  x?: number;
  y?: number;
  z?: number;
  vx?: number;
  vy?: number;
  vz?: number;
  createdAt: number;
};
