import { Canvas } from '../../util/canvas';
import { RenderQueue } from '../game-render-queue';
import { GameWorld } from '../game-world';

export abstract class GameObject {
  static idCounter = 0;

  id: string;
  vec: [number, number];
  direction: number;
  objectWidth: number;
  objectHeight: number;
  world: GameWorld;

  constructor(x: number, y: number, width: number, height: number, direction: number, world: GameWorld) {
    this.id = String(GameObject.idCounter++);
    this.vec = [x, y];
    this.direction = direction;
    this.objectWidth = width;
    this.objectHeight = height;
    this.world = world;
  }

  getTargetVelocity() {}

  abstract update(deltaTime: number): void;

  render(queue: RenderQueue) {
    queue.addObjectCommand(this.getZ(), this.getY(), true, 'red', (canvas: Canvas) => {
      canvas.fillRect(
        -this.getWidth() / 2 + this.getX(),
        -this.getHeight() / 2 + this.getY() - this.getZ(),
        this.getWidth(),
        this.getHeight(),
      );
    });
  }

  getX() {
    return this.vec[0];
  }
  setX(x: number) {
    this.vec[0] = x;
  }

  getY() {
    return this.vec[1];
  }
  setY(y: number) {
    this.vec[1] = y;
  }

  getZ() {
    return this.world.terrain.getHeightAt(this.vec);
  }

  getDirection() {
    return this.direction;
  }
  setDirection(direction: number) {
    this.direction = direction;
  }
  getWidth() {
    return this.objectWidth;
  }
  getHeight() {
    return this.objectHeight;
  }
  getClass() {
    return 'Object';
  }
}
