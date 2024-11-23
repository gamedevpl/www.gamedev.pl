import { RenderState } from './render-state';
import {
  SNOW_COLOR,
  SNOW_PARTICLE_MAX_SIZE,
  SNOW_PARTICLE_MIN_SIZE,
  SNOW_PARTICLE_MAX_Z,
  SnowParticle,
} from './snow-render-types';

/**
 * Calculate particle size based on z-position
 */
function calculateParticleSize(z: number): number {
  const depthFactor = 1 - z / SNOW_PARTICLE_MAX_Z;
  const size = SNOW_PARTICLE_MIN_SIZE + (SNOW_PARTICLE_MAX_SIZE - SNOW_PARTICLE_MIN_SIZE) * depthFactor;
  return Math.max(SNOW_PARTICLE_MIN_SIZE, Math.min(SNOW_PARTICLE_MAX_SIZE, Math.round(size)));
}

/**
 * Sort particles by z-coordinate for proper depth rendering
 */
function sortParticlesByDepth(particles: SnowParticle[]): SnowParticle[] {
  return [...particles].sort((a, b) => {
    if (!a.active && !b.active) return 0;
    if (!a.active) return 1;
    if (!b.active) return -1;
    return b.z - a.z;
  });
}

/**
 * Main snow rendering function
 */
export function renderSnow(ctx: CanvasRenderingContext2D, render: RenderState): void {
  const { particles } = render.snow.pool;

  // Early exit if no particles
  if (particles.length === 0) return;

  // Save context state
  ctx.save();

  // Set blending for snow effect
  ctx.globalCompositeOperation = 'screen';

  // Sort particles by depth
  const sortedParticles = sortParticlesByDepth(particles);

  // Pre-calculate color string
  const snowColor = `rgb(${SNOW_COLOR.RED}, ${SNOW_COLOR.GREEN}, ${SNOW_COLOR.BLUE})`;
  ctx.fillStyle = snowColor;

  // Render particles
  for (const particle of sortedParticles) {
    if (!particle.active) continue;

    // Calculate size based on depth
    const size = calculateParticleSize(particle.z);

    // Set opacity
    ctx.globalAlpha = particle.alpha * SNOW_COLOR.BASE_ALPHA;

    // Calculate screen position (centered)
    const finalX = Math.round(particle.x - size / 2);
    const finalY = Math.round(particle.y - size / 2);

    // Draw particle
    ctx.fillRect(finalX, finalY, size, size);
  }

  // Restore context state
  ctx.restore();
}
