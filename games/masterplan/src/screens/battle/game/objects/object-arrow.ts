import { GameObject } from './game-object';
import { VMath } from '../../util/vmath';
import { GameWorld } from '../game-world';
import { SoldierObject } from './object-soldier';
import { RenderQueue } from '../game-render-queue';

const DIMS = {
  arrow: [10, 1],
  ball: [10, 10],
} as const;

export class ArrowObject extends GameObject {
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
    super(from[0], from[1], DIMS[type][0], DIMS[type][1], VMath.atan2(from, to), world);
    this.from = from;
    this.to = to;
    this.maxDist = VMath.distance(from, to);
    this.attackBase = attackBase;
    this.type = type;

    this.v = VMath.normalize(VMath.sub(to, from));
  }

  update(deltaTime: number) {
    const d = VMath.scale(this.v, deltaTime * 20);
    this.vec[0] += d[0];
    this.vec[1] += d[1];
    const progress = Math.sin((VMath.distance(this.from, this.vec) / this.maxDist) * Math.PI);
    this.adir = this.direction - (Math.PI / 3) * (1 - progress);
    this.ay = this.vec[1] - (progress * this.maxDist) / 10;

    if (VMath.distance(this.from, this.vec) > this.maxDist) {
      this.world.removeObject(this);
    }
  }

  render(queue: RenderQueue): void {
    queue.addObjectCommand(this.getZ(), this.getY(), true, 'red', (canvas) => {
      canvas
        .save()
        .translate(this.getX(), this.getY() - this.getZ())
        .rotate(this.getDirection())
        .fillRect(-this.getWidth() / 2, -this.getHeight() / 2, this.getWidth(), this.getHeight())
        .restore();
    });
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
