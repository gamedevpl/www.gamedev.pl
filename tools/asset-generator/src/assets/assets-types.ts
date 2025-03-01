export interface AssetAnimationState {
  progress: number;
  stance: string;
}

export interface Asset<T extends AssetAnimationState = AssetAnimationState> {
  name: string;

  description: string;

  referenceImage?: string;

  stances: string[];

  render(ctx: CanvasRenderingContext2D, animState?: T): void;
}
