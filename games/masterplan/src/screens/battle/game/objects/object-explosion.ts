import { GameObject } from './game-object';
import { BALL_RANGE } from '../../consts';
import { GameWorld } from '../game-world';
import { Canvas } from '../../util/canvas';
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
      queue.addObjectCommand(this.getZ(), this.getY(), true, 'black', (canvas: Canvas) => {
        canvas
          .save()
          .strokeStyle('black')
          .translate(this.getX(), this.getY() - this.getZ())
          .arc(0, 0, BALL_RANGE * Math.min(dt / 100, 1))
          .restore();
      });
    }
  }

  update(): void {}

  getClass() {
    return 'Explosion';
  }
}
