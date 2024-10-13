import { Canvas } from '../../util/canvas';

export abstract class GameObject {
  static idCounter = 0;

  id: string;
  vec: [number, number];
  direction: number;
  objectWidth: number;
  objectHeight: number;
  constructor(x: number, y: number, width: number, height: number, direction: number) {
    this.id = String(GameObject.idCounter++);
    this.vec = [x, y];
    this.direction = direction;
    this.objectWidth = width;
    this.objectHeight = height;
  }

  getTargetVelocity() {}

  abstract update(deltaTime: number): void;

  render(canvas: Canvas) {
    canvas
      .save()
      .translate(-this.getWidth() / 2, -this.getHeight() / 2)
      .fillRect(0, 0, this.getWidth(), this.getHeight())
      .restore();
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
