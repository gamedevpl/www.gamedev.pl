export interface Asset {
  name: string;

  description: string;

  referenceImage?: string;

  stances: string[];

  render(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, progress: number, stance: string, direction: 'left' | 'right'): void;
}