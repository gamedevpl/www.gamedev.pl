import { GameObject } from './game-object';
import { BALL_RANGE } from '../../consts';
import { GameWorld } from '../game-world';
import { RenderQueue } from '../game-render-queue';

export class ExplosionObject extends GameObject {
  time: number;

  constructor(vec: [number, number], time: number, world: GameWorld) {
    super(vec[0], vec[1], BALL_RANGE * 2, BALL_RANGE * 2, 0, world);
    this.time = time;
  }

  render(queue: RenderQueue) {
    const dt = this.world.getTime() - this.time;

    if (dt < 100) {
      const radius = BALL_RANGE * Math.min(dt / 100, 1);
      const segments = 16; // Number of segments to approximate the circle
      const points: [number, number][] = [];

      for (let i = 0; i <= segments; i++) {
        const angle = (i / segments) * Math.PI * 2;
        points.push([Math.cos(angle) * radius, Math.sin(angle) * radius]);
      }

      queue.addObjectCommand(
        this.getX(),
        this.getY() - this.world.terrain.getHeightAt(this.vec),
        this.getZ(),
        true,
        'black',
        points,
      );
    }
  }

  update(): void {}

  getClass() {
    return 'Explosion';
  }
}
