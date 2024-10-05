import { Canvas } from '../../util/canvas';

export class Particle {
  gravity = 5;

  constructor(
    public x: number,
    public y: number,
    public z: number,
    public velocityX: number,
    public velocityY: number,
    public velocityZ: number,
    public life: number,
    public type: 'blood' | 'smoke' = 'blood',
  ) {}

  update(deltaTime: number) {
    this.x += this.velocityX * deltaTime;
    this.y += this.velocityY * deltaTime;
    this.z = Math.max(this.z + this.velocityZ * deltaTime, 0);

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
    if (this.type === 'smoke') {
      return this.life <= 0;
    } else {
      return this.life <= 0 && this.z <= 0 && Math.abs(this.velocityX) < 0.01 && Math.abs(this.velocityY) < 0.01;
    }
  }
}

export class ParticleSystem {
  particles: Particle[] = [];
  deadParticlesCanvas: HTMLCanvasElement;
  deadParticlesContext: CanvasRenderingContext2D;

  constructor(width: number, height: number) {
    this.deadParticlesCanvas = document.createElement('canvas');
    this.deadParticlesCanvas.width = width;
    this.deadParticlesCanvas.height = height;
    this.deadParticlesContext = this.deadParticlesCanvas.getContext('2d')!;
    this.deadParticlesContext.translate(width / 2, height / 2);
  }

  addParticle(particle: Particle) {
    this.particles.push(particle);
  }

  update(deltaTime: number) {
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
    const bloodPath = new Path2D();
    deadParticles.forEach((particle) => {
      if (particle.type === 'blood') {
        bloodPath.moveTo(particle.x, particle.y - particle.z);
        bloodPath.arc(particle.x, particle.y - particle.z, 1, 0, Math.PI * 2);
        bloodPath.closePath();
      }
    });
    this.deadParticlesContext.fillStyle = 'red';
    this.deadParticlesContext.fill(bloodPath);
  }

  renderDead(context: Canvas) {
    // Render the dead particles from the offscreen canvas
    context.drawImage(
      this.deadParticlesCanvas,
      -this.deadParticlesCanvas.width / 2,
      -this.deadParticlesCanvas.height / 2,
    );
  }

  renderActive(context: Canvas) {
    context.save();

    // Render the active particles
    const bloodPath = new Path2D();
    const smokePath = new Path2D();
    this.particles.forEach((particle) => {
      const path = particle.type === 'smoke' ? smokePath : bloodPath;
      path.moveTo(particle.x, particle.y - particle.z);
      path.arc(
        particle.x,
        particle.y - particle.z,
        particle.type === 'smoke' ? Math.min(particle.life, 2) : 1,
        0,
        Math.PI * 2,
      );
      path.closePath();
    });

    context.fillStyle('red');
    context.fill(bloodPath);
    context.fillStyle('rgba(128, 128, 128, 0.5)');
    context.fill(smokePath);

    context.restore();
  }
}
