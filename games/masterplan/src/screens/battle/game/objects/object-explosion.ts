import { GameObject } from './game-object';
import { BALL_RANGE } from '../../consts';
import { GameWorld } from '../game-world';
import { Canvas } from '../../util/canvas';

export class ExplosionObject extends GameObject {
  time: number;
  world: GameWorld;

  constructor(vec: [number, number], time: number, world: GameWorld) {
    super(vec[0], vec[1], BALL_RANGE * 2, BALL_RANGE * 2, 0);
    this.time = time;
    this.world = world;
  }

  render(canvas: Canvas) {
    const dt = this.world.getTime() - this.time;

    if (dt < 100) {
      canvas
        .save()
        .arc(0, 0, BALL_RANGE * Math.min(dt / 100, 1))
        .restore();
    }
  }

  update(): void {}

  getClass() {
    return 'Explosion';
  }
}
