import { Canvas } from '../../util/canvas';
import { Terrain } from '../terrain/terrain';
import { RenderQueue } from '../game-render-queue';

export class Particle {
  gravity = 5;

  constructor(
    public x: number,
    public y: number,
    public z: number,
    private terrain: Terrain,
    public velocityX: number,
    public velocityY: number,
    public velocityZ: number,
    public life: number,
    public type: 'blood' | 'smoke' = 'blood',
  ) {}

  update(deltaTime: number) {
    this.x += this.velocityX * deltaTime;
    this.y += this.velocityY * deltaTime;
    this.z = Math.max(this.z + this.velocityZ * deltaTime, this.terrain.getHeightAt([this.x, this.y]));

    if (this.type === 'smoke') {
      // Smoke particles float upwards and dissipate
      this.velocityX *= 0.99;
      this.velocityY *= 0.99;
      this.velocityZ = Math.max(this.velocityZ - 1 * deltaTime, 0.5); // Slower descent for smoke
    } else {
      // Blood particles behave as before
      this.velocityX *= 0.98;
      this.velocityY *= 0.98;
      this.velocityZ -= this.gravity * deltaTime;
    }

    this.life -= deltaTime;
  }

  isAlive() {
    return this.life > 0;
  }

  isDead() {
    return this.life <= 0;
  }
}

const isBrowser = typeof window !== 'undefined';

export class ParticleSystem {
  particles: Particle[] = [];
  deadParticlesCanvas: HTMLCanvasElement | undefined;
  deadParticlesContext: CanvasRenderingContext2D | undefined;

  constructor(width: number, height: number, public terrain: Terrain) {
    if (isBrowser) {
      this.deadParticlesCanvas = document.createElement('canvas');
      this.deadParticlesCanvas.width = width;
      this.deadParticlesCanvas.height = height;
      this.deadParticlesContext = this.deadParticlesCanvas.getContext('2d')!;
      this.deadParticlesContext.translate(width / 2, height / 2);
    }
  }

  addParticle(particle: Particle) {
    if (isBrowser) this.particles.push(particle);
  }

  update(deltaTime: number) {
    if (!isBrowser) {
      return;
    }

    const deadParticles: Particle[] = [];
    this.particles = this.particles.filter((p) => {
      p.update(deltaTime);
      if (p.isDead()) {
        if (p.type === 'blood') {
          deadParticles.push(p);
        }
        return false;
      }
      return true;
    });
    this.renderDeadParticles(deadParticles);
  }

  renderDeadParticles(deadParticles: Particle[]) {
    if (this.deadParticlesContext) {
      this.deadParticlesContext.fillStyle = 'rgba(255, 0, 0, 0.5)';
      deadParticles.forEach((particle) => {
        if (particle.type === 'blood') {
          this.deadParticlesContext!.beginPath();
          this.deadParticlesContext!.arc(particle.x, particle.y - particle.z, 1, 0, Math.PI * 2);
          this.deadParticlesContext!.fill();
        }
      });
    }
  }

  renderDead(context: Canvas) {
    if (this.deadParticlesCanvas) {
      // Render the dead particles from the offscreen canvas
      context.drawImage(
        this.deadParticlesCanvas,
        -this.deadParticlesCanvas.width / 2,
        -this.deadParticlesCanvas.height / 2,
      );
    }
  }

  addRenderCommands(renderQueue: RenderQueue) {
    // Add active particles render commands
    const bloodParticles = this.particles.filter((p) => p.type === 'blood');
    const smokeParticles = this.particles.filter((p) => p.type === 'smoke');

    if (bloodParticles.length > 0) {
      bloodParticles.forEach((particle) => {
        renderQueue.renderShape(
          'particles',
          particle.x,
          particle.y,
          particle.z,
          [[0, 0], [1, 0], [1, 1], [0, 1]],  // Simple square shape for the particle
          'rgba(255, 0, 0, 0.5)'
        );
      });
    }

    if (smokeParticles.length > 0) {
      smokeParticles.forEach((particle) => {
        const size = Math.min(particle.life, 2);
        renderQueue.renderShape(
          'particles',
          particle.x - size / 2,
          particle.y - size / 2,
          particle.z,
          [[0, 0], [size, 0], [size, size], [0, size]],  // Square shape with size based on particle life
          'rgba(128, 128, 128, 0.5)'
        );
      });
    }
  }
}