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
  ) {}

  update(deltaTime: number) {
    this.x += this.velocityX * deltaTime;
    this.y += this.velocityY * deltaTime;
    this.z = Math.max(this.z + this.velocityZ * deltaTime, 0);

    this.velocityX *= 0.98;
    this.velocityY *= 0.98;
    this.velocityZ -= this.gravity * deltaTime;

    this.life -= deltaTime;
  }

  isAlive() {
    return this.life > 0;
  }

  isDead() {
    return this.life <= 0 && this.z <= 0 && Math.abs(this.velocityX) < 0.01 && Math.abs(this.velocityY) < 0.01;
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
    this.deadParticlesContext.fillStyle = 'red';
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
        deadParticles.push(p);
        return false;
      }
      return true;
    });
    this.renderDeadParticles(deadParticles);
  }

  renderDeadParticles(deadParticles: Particle[]) {
    const path = new Path2D();
    deadParticles.forEach((particle) => {
      path.moveTo(particle.x, particle.y - particle.z);
      path.arc(particle.x, particle.y - particle.z, 1, 0, Math.PI * 2);
      path.closePath();
    });
    this.deadParticlesContext.fill(path);
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
    context.fillStyle('red');
    const path = new Path2D();
    this.particles.forEach((particle) => {
      path.moveTo(particle.x, particle.y - particle.z);
      path.arc(particle.x, particle.y - particle.z, 1, 0, Math.PI * 2);
      path.closePath();
    });
    context.fill(path);

    context.restore();
  }
}
