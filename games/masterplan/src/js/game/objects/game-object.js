export class GameObject {
  constructor(x, y, width, height, direction) {
    this.vec = [x, y];
    this.direction = direction;
    this.objectWidth = width;
    this.objectHeight = height;
  }

  getTargetVelocity() {}

  update(deltaTime) {}

  /**
   * @param {Canvas} canvas
   */
  render(canvas) {
    canvas
      .save()
      .translate(-this.getWidth() / 2, -this.getHeight() / 2)
      .fillRect(0, 0, this.getWidth(), this.getHeight())
      .restore();
  }

  getX() {
    return this.vec[0];
  }
  setX(x) {
    this.vec[0] = x;
  }

  getY() {
    return this.vec[1];
  }
  setY(y) {
    this.vec[1] = y;
  }

  getDirection() {
    return this.direction;
  }
  setDirection(direction) {
    this.direction = direction;
  }
  getWidth() {
    return this.objectWidth;
  }
  getHeight() {
    return this.objectHeight;
  }
  vec() {
    return this.vec;
  }
  getClass() {
    return 'Object';
  }
}
