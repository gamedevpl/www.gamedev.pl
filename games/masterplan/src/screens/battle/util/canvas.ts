import { LAYER_DEFAULT, EDGE_RADIUS } from '../consts';

/**
 * @param {String} layerName
 * @return {Canvas}
 */
export function getCanvas(layerName: string) {
  layerName = layerName || LAYER_DEFAULT;

  var canvas = Canvas.layers[layerName];

  if (canvas) {
    return canvas;
  }

  return (Canvas.layers[layerName] = new Canvas(layerName));
}

export function freeCanvas(layerName: string) {
  layerName = layerName || LAYER_DEFAULT;

  var canvas = Canvas.layers[layerName];

  if (canvas) {
    canvas.destroy();
    delete Canvas.layers[layerName];
  }
}

export class Canvas {
  public element: HTMLCanvasElement;
  public ctx: CanvasRenderingContext2D;
  static layers: { [key: string]: Canvas } = {};

  constructor(id: string) {
    this.element = document.createElement('canvas');
    this.element.id = id;
    this.element.width = EDGE_RADIUS * 3;
    this.element.height = EDGE_RADIUS * 2;
    this.ctx = this.element.getContext('2d') as CanvasRenderingContext2D;

    document.body.appendChild(this.element);
  }

  destroy() {
    document.body.removeChild(this.element);
  }

  getWidth() {
    return this.element.width;
  }

  getHeight() {
    return this.element.height;
  }

  clear() {
    this.ctx.clearRect(0, 0, this.getWidth(), this.getHeight());
    return this;
  }

  drawText(x: number, y: number, text: string) {
    this.ctx.fillStyle = 'white';
    this.ctx.font = '11px serif';
    this.ctx.fillText(text, x - this.ctx.measureText(text).width / 2, y);
    return this;
  }

  fillStyle(fillStyle: string) {
    this.ctx.fillStyle = fillStyle;
    return this;
  }

  strokeStyle(strokeStyle: string) {
    this.ctx.strokeStyle = strokeStyle;
    return this;
  }

  fillRect(x: number, y: number, width: number, height: number) {
    this.ctx.fillRect(x, y, width, height);
    return this;
  }

  arc(x: number, y: number, radius: number) {
    this.ctx.beginPath();
    this.ctx.arc(x, y, radius, 0, Math.PI * 2);
    this.ctx.stroke();
    return this;
  }

  line(fromX: number, fromY: number, toX: number, toY: number) {
    this.save();
    this.ctx.beginPath();
    this.ctx.moveTo(fromX, fromY);
    this.ctx.lineTo(toX, toY);
    this.ctx.stroke();
    this.restore();
    return this;
  }

  drawImage(image: CanvasImageSource, x: number, y: number) {
    this.ctx.drawImage(image, x, y);
    return this;
  }

  fill(path: Path2D) {
    this.ctx.fill(path);
  }

  scale(scale: number) {
    this.ctx.scale(scale, scale);
    return this;
  }

  translate(x: number, y: number) {
    this.ctx.translate(x, y);
    return this;
  }

  rotate(direction: number) {
    this.ctx.rotate(direction);
    return this;
  }

  save() {
    this.ctx.save();
    return this;
  }

  restore() {
    this.ctx.restore();
    return this;
  }

  getCtx() {
    return this.ctx;
  }
}
