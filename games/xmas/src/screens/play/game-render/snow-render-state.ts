import { GameWorldState } from '../game-world/game-world-types';
import { GAME_WORLD_WIDTH } from '../game-world/game-world-consts';
import {
  SNOW_PARTICLE_COUNT,
  SNOW_PARTICLE_MAX_LIFETIME,
  SNOW_PARTICLE_MIN_LIFETIME,
  SNOW_PARTICLE_MIN_Z,
  SNOW_PARTICLE_MAX_Z,
  SNOW_BASE_FALL_SPEED,
  SNOW_SPAWN_HEIGHT,
  SNOW_DESPAWN_HEIGHT,
  SnowParticle,
  SnowParticlePool,
  ParticleInitOptions,
} from './snow-render-types';

// Complete snow system state
export type SnowRenderState = {
  pool: SnowParticlePool;
  lastUpdate: number;
};

/**
 * Initialize a particle with optional progress parameter
 * @param progress Value between 0 and 1 indicating particle's progress through its lifetime
 * @param options Optional initialization parameters
 */
function initParticle(progress: number = 0, options: ParticleInitOptions): SnowParticle {
  // Calculate z-position and use it for speed variation
  const zFactor = Math.random();
  const z = SNOW_PARTICLE_MIN_Z + zFactor * (SNOW_PARTICLE_MAX_Z - SNOW_PARTICLE_MIN_Z);

  // Calculate lifetime based on z-position and randomness
  const lifetime =
    SNOW_PARTICLE_MIN_LIFETIME + (zFactor + Math.random()) * (SNOW_PARTICLE_MAX_LIFETIME - SNOW_PARTICLE_MIN_LIFETIME);

  // Calculate fall speed based on z-position (particles further away fall slower)
  const fallSpeed = SNOW_BASE_FALL_SPEED * (2 - zFactor);

  // Calculate initial position
  const x = options.x ?? Math.random() * GAME_WORLD_WIDTH;
  const totalDistance = SNOW_DESPAWN_HEIGHT - SNOW_SPAWN_HEIGHT;
  const y = options.y ?? SNOW_SPAWN_HEIGHT + totalDistance * progress;

  return {
    active: true,
    x,
    y,
    z,
    vx: 0,
    vy: fallSpeed,
    vz: 0,
    size: 0, // Will be calculated based on z-position during rendering
    alpha: 1,
    createdAt: options.createdAt + lifetime * progress,
    lifetime,
  };
}

/**
 * Initialize particle pool with active particles distributed across the game world
 */
function createParticlePool(): SnowParticlePool {
  const particles = Array(SNOW_PARTICLE_COUNT)
    .fill(null)
    .map(() => {
      // Distribute particles evenly across vertical space with some randomness
      const baseProgress = Math.random();
      // Add some noise to make distribution look more natural
      const progress = baseProgress + Math.random() * 0.1 - 0.05;
      return initParticle(progress, { createdAt: Date.now() });
    });

  return {
    particles,
    activeCount: SNOW_PARTICLE_COUNT,
  };
}

/**
 * Creates initial snow render state
 */
export function createSnowRenderState(): SnowRenderState {
  return {
    pool: createParticlePool(),
    lastUpdate: Date.now(),
  };
}

/**
 * Spawn a new particle or reuse an inactive one
 */
function spawnParticle(pool: SnowParticlePool, currentTime: number): void {
  // Find first inactive particle
  const particle = pool.particles.find((p) => !p.active);
  if (!particle) return;

  // Initialize new particle with progress 0 (start of lifetime)
  Object.assign(particle, initParticle(0, { createdAt: currentTime }));

  pool.activeCount++;
}

/**
 * Update a single particle's position and state
 */
function updateParticle(particle: SnowParticle, deltaTime: number, currentTime: number): boolean {
  // Check if particle should be deactivated
  if (currentTime - particle.createdAt >= particle.lifetime || particle.y >= SNOW_DESPAWN_HEIGHT) {
    return false;
  }

  // Update position (only vertical movement for now)
  particle.y += particle.vy * deltaTime;

  return true;
}

/**
 * Update the entire snow system state
 */
export function updateSnowRenderState(
  world: GameWorldState,
  state: SnowRenderState,
  deltaTime: number,
): SnowRenderState {
  const currentTime = world.time;

  // Update existing particles
  for (const particle of state.pool.particles) {
    if (!particle.active) continue;

    const isAlive = updateParticle(particle, deltaTime, currentTime);

    if (!isAlive) {
      particle.active = false;
      state.pool.activeCount--;
    }
  }

  // Spawn new particles to maintain count
  while (state.pool.activeCount < SNOW_PARTICLE_COUNT) {
    spawnParticle(state.pool, currentTime);
  }

  return {
    pool: state.pool,
    lastUpdate: currentTime,
  };
}
