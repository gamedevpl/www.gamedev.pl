import { GameObject } from './game-object';
import { VMath } from '../../util/vmath';
import { BALL_RANGE } from '../../consts';
import { GameWorld } from '../game-world';
import { Canvas } from '../../util/canvas';
import { SoldierObject } from './object-soldier';

const DIMS = {
  arrow: [10, 1],
  ball: [10, 10],
} as const;

export class ArrowObject extends GameObject {
  world: GameWorld;
  from: [number, number];
  to: [number, number];
  maxDist: number;
  attackBase: number;
  type: string;
  v: [number, number];
  adir: number | undefined;
  ay: number | undefined;

  constructor(
    from: [number, number],
    to: [number, number],
    world: GameWorld,
    attackBase: number,
    type: 'arrow' | 'ball',
  ) {
    super(from[0], from[1], DIMS[type][0], DIMS[type][1], VMath.atan2(from, to));
    this.world = world;
    this.from = from;
    this.to = to;
    this.maxDist = VMath.distance(from, to);
    this.attackBase = attackBase;
    this.type = type;

    this.v = VMath.normalize(VMath.sub(to, from));
  }

  update(deltaTime: number) {
    var d = VMath.scale(this.v, deltaTime * 20);
    this.vec[0] += d[0];
    this.vec[1] += d[1];
    var progress = Math.sin((VMath.distance(this.from, this.vec) / this.maxDist) * Math.PI);
    this.adir = this.direction - (Math.PI / 3) * (1 - progress);
    this.ay = this.vec[1] - (progress * this.maxDist) / 10;

    if (VMath.distance(this.from, this.vec) > this.maxDist) {
      this.world.removeObject(this);
    }
  }

  getY() {
    return this.ay!;
  }

  getDirection() {
    return this.adir!;
  }

  isHit() {
    return this.maxDist - VMath.distance(this.from, this.vec) < 10;
  }

  hit(soldier: SoldierObject, distance: number) {
    soldier.hitByArrow(this, distance);
  }

  getAttack() {
    return this.attackBase;
  }

  getClass() {
    return 'Arrow';
  }
}

export class ExplosionObject extends GameObject {
  time: number;
  world: GameWorld;
  constructor(vec: [number, number], time: number, world: GameWorld) {
    super(vec[0], vec[1], BALL_RANGE * 2, BALL_RANGE * 2, 0);
    this.time = time;
    this.world = world;
  }

  render(canvas: Canvas) {
    var dt = this.world.getTime() - this.time;

    if (dt < 100) {
      canvas
        .save()
        .arc(0, 0, BALL_RANGE * Math.min(dt / 100, 1))
        .restore();
    }
  }

  getClass() {
    return 'Explosion';
  }
}
