import { CanvasRenderingContext2D } from 'canvas';

export interface Asset {
  /** The name of the asset */
  name: string;

  /** Detailed description of the asset, including its requirements and characteristics */
  description: string;

  /** 
   * Optional path to a reference image file, relative to the asset directory.
   * This image serves as inspiration and reference points for the asset generation
   * and assessment process.
   * @example "reference.png"
   */
  referenceImage?: string;

  /**
   * Renders the asset to the provided canvas context
   * @param ctx The canvas rendering context to draw on
   */
  render(ctx: CanvasRenderingContext2D): void;
}