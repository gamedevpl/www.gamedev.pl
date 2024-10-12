import { Vec, VMath } from '../../../util/vmath';
import { Particle, ParticleSystem } from '../particle-system';

export function createSmokeEffect([x, y]: Vec, [sourceX, sourceY]: Vec, particleSystem: ParticleSystem) {
  const [dirX, dirY] = VMath.scale(VMath.normalize([x - sourceX, y - sourceY]), 5);

  const particleCount = 30 + Math.random() * 10;

  for (let i = 0; i < particleCount; i++) {
    const velocityX = (Math.random() - Math.random()) * 2 + dirX;
    const velocityY = (Math.random() - Math.random()) * 2 + dirY;
    const velocityZ = Math.random() * 10 + 5; // Upward velocity
    const life = 50 + Math.random() * 5;

    const particle = new Particle(
      x,
      y,
      particleSystem.terrain.getHeightAt([x, y]),
      particleSystem.terrain,
      velocityX,
      velocityY,
      velocityZ,
      life,
      'smoke',
    );
    particleSystem.addParticle(particle);
  }
}
