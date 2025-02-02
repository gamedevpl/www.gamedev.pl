import { CanvasRenderingContext2D } from 'canvas';

export interface Asset {
  name: string;
  description: string;
  render(ctx: CanvasRenderingContext2D): void;
}
