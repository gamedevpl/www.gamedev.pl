export interface BaseAsset {
  name: string;
  description: string;
}

export interface VisualAsset extends BaseAsset {
  type?: 'visual';

  // Optional reference image for the asset
  // DO NOT specify the path here, if it was not present in the original asset
  referenceImage?: string;

  stances: string[];

  render(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    progress: number,
    stance: string,
    ...anyArgs: unknown[]
  ): void;
}

export interface SoundAsset extends BaseAsset {
  type: 'sound';
  prompt: string;
  duration?: number;
  audioFile?: string;
}

export type Asset = VisualAsset | SoundAsset;

export function isSoundAsset(asset: Asset): asset is SoundAsset {
  return asset.type === 'sound';
}

export function isVisualAsset(asset: Asset): asset is VisualAsset {
  return asset.type !== 'sound';
}

/**
 * Result of asset generation process
 */
export interface AssetGenerationResult {
  /** Path to the asset file */
  assetPath: string;
  /** Assessment of the asset if available, or null if direct visual generation was used */
  assessment?: string | null;
  /** Whether asset was regenerated or just rendered */
  regenerated: boolean;
  /** Results of asset rendering */
  renderingResult?: { stance: string; mediaType: string; dataUrl: string; filePath: string }[];
  /** Results of linting process */
  linting?: AssetLintingResult;
  /** Path to the generated audio file (if sound asset) */
  audioFile?: string;
}

/**
 * Interface for linting results in the asset generation process
 */
export interface AssetLintingResult {
  /** Whether linting was performed */
  lintingPerformed: boolean;
  /** Whether any linting errors were found */
  hasLintingErrors: boolean;
  /** Whether any linting warnings were found */
  hasLintingWarnings: boolean;
  /** Whether linting errors were fixed */
  errorsFixed: boolean;
  /** Summary of linting fixes if applied */
  fixSummary?: string;
}
