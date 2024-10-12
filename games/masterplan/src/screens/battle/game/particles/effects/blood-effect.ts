import { Vec, VMath } from '../../../util/vmath';
import { Particle, ParticleSystem } from '../particle-system';

export function spillBlood([x, y]: Vec, [sourceX, sourceY]: Vec, amount: number, particleSystem: ParticleSystem) {
  const [dirX, dirY] = VMath.scale(VMath.normalize([x - sourceX, y - sourceY]), 15);

  for (let i = 0; i < amount + 2; i++) {
    const velocityX = (Math.random() - Math.random()) * 5 + dirX;
    const velocityY = (Math.random() - Math.random()) * 5 + dirY;
    const velocityZ = Math.random() * 15;
    const life = 0.5;

    const particle = new Particle(
      x,
      y,
      particleSystem.terrain.getHeightAt([x, y]),
      particleSystem.terrain,
      velocityX,
      velocityY,
      velocityZ,
      life,
    );
    particleSystem.addParticle(particle);
  }
}
