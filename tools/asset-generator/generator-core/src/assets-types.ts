export interface Asset {
  name: string;

  description: string;

  referenceImage?: string;

  stances: string[];

  render(ctx: CanvasRenderingContext2D, progress: number, stance: string, direction: 'left' | 'right'): void;
}
