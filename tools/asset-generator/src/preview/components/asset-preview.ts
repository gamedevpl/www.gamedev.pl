/**
 * Generic Asset Preview Component
 *
 * This component handles common asset preview functionality and provides
 * a base class that can be extended for specific asset types.
 */

import { Asset } from '../../assets/assets-types';
import { AssetAdapter, createAssetAdapter } from '../asset-adapter';

/**
 * Interface for asset preview options
 */
export interface AssetPreviewOptions {
  canvas: HTMLCanvasElement;
  controlsContainer: HTMLElement;
  animationSpeed?: number;
  autoPlay?: boolean;
  backgroundColor?: string;
}

/**
 * Interface for asset preview events
 */
export interface AssetPreviewEvents {
  onRender?: (timestamp: number) => void;
  onPlay?: () => void;
  onPause?: () => void;
  onReset?: () => void;
  onResize?: (width: number, height: number) => void;
}

/**
 * Base class for asset previews
 */
export abstract class AssetPreviewComponent<T extends Asset> {
  protected canvas: HTMLCanvasElement;
  protected controlsContainer: HTMLElement;
  protected adapter: AssetAdapter<T>;
  protected options: AssetPreviewOptions;
  protected events: AssetPreviewEvents = {};
  protected animationSpeed: number = 1.0;
  protected isPlaying: boolean = true;
  protected progress: number = 0;

  /**
   * Create a new AssetPreviewComponent
   * @param asset The asset to preview
   * @param options Preview options
   */
  constructor(asset: T, options: AssetPreviewOptions) {
    this.canvas = options.canvas;
    this.controlsContainer = options.controlsContainer;
    this.options = options;
    this.animationSpeed = options.animationSpeed || 1.0;

    // Create the asset adapter
    this.adapter = createAssetAdapter(asset, this.canvas);
    this.adapter.setAnimationSpeed(this.animationSpeed);
  }

  /**
   * Initialize the component
   * This method should be overridden by subclasses
   */
  initialize(): void {
    // Start animation if autoPlay is enabled
    if (this.options.autoPlay !== false) {
      this.play();
    }

    // Handle window resize
    window.addEventListener('resize', this.handleResize.bind(this));

    // Initialize UI controls
    this.initializeControls();
  }

  /**
   * Initialize UI controls
   * This method should be overridden by subclasses
   */
  protected abstract initializeControls(): void;

  /**
   * Render the asset
   * @param options Optional rendering options
   */
  public render(options?: any): void {
    this.adapter.render(options);
  }

  /**
   * Start the animation loop
   */
  public play(): void {
    this.isPlaying = true;
    this.adapter.startAnimation(this.animationFrame.bind(this));

    if (this.events.onPlay) {
      this.events.onPlay();
    }
  }

  /**
   * Pause the animation loop
   */
  public pause(): void {
    this.isPlaying = false;
    this.adapter.stopAnimation();

    if (this.events.onPause) {
      this.events.onPause();
    }
  }

  /**
   * Toggle the animation state
   */
  public togglePlayPause(): void {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  /**
   * Reset the animation
   */
  public reset(): void {
    this.progress = 0;
    this.render({ progress: this.progress });

    if (this.events.onReset) {
      this.events.onReset();
    }
  }

  /**
   * Set the animation speed
   * @param speed The animation speed (1.0 = normal speed)
   */
  public setAnimationSpeed(speed: number): void {
    this.animationSpeed = speed;
    this.adapter.setAnimationSpeed(speed);
  }

  /**
   * Get the animation speed
   */
  public getAnimationSpeed(): number {
    return this.animationSpeed;
  }

  /**
   * Check if the animation is playing
   */
  public isAnimationPlaying(): boolean {
    return this.isPlaying;
  }

  /**
   * Get the asset
   */
  public getAsset(): T {
    return this.adapter.getAsset();
  }

  /**
   * Set event handlers
   * @param events Event handlers
   */
  public setEvents(events: AssetPreviewEvents): void {
    this.events = { ...this.events, ...events };
  }

  /**
   * Handle window resize
   */
  protected handleResize(): void {
    // Get the container dimensions
    const containerWidth = this.canvas.parentElement?.clientWidth || window.innerWidth;
    const containerHeight = this.canvas.parentElement?.clientHeight || window.innerHeight;

    // Calculate the new canvas dimensions
    const aspectRatio = 1; // Default to square
    let width = containerWidth;
    let height = width / aspectRatio;

    // Ensure the canvas fits within the container
    if (height > containerHeight) {
      height = containerHeight;
      width = height * aspectRatio;
    }

    // Update the canvas dimensions
    this.canvas.width = width;
    this.canvas.height = height;

    // Render the asset
    this.render({ progress: this.progress });

    // Call the onResize event
    if (this.events.onResize) {
      this.events.onResize(width, height);
    }
  }

  /**
   * Animation frame callback
   * @param deltaTime Time since the last frame in milliseconds
   */
  protected animationFrame(deltaTime: number): void {
    // Update the progress (0.0 to 1.0)
    // Assuming a full animation cycle takes 5 seconds at normal speed
    const cycleDuration = 5000; // 5 seconds
    this.progress = (this.progress + deltaTime / cycleDuration) % 1.0;

    // Render the asset with the current progress
    this.render({ progress: this.progress });

    // Call the onRender event
    if (this.events.onRender) {
      this.events.onRender(deltaTime);
    }
  }

  /**
   * Clean up resources
   */
  public dispose(): void {
    this.adapter.stopAnimation();
    window.removeEventListener('resize', this.handleResize.bind(this));
  }
}

/**
 * Factory function to create an asset preview component
 * @param assetType The type of asset preview to create
 * @param asset The asset to preview
 * @param options Preview options
 * @returns An asset preview component
 */
export function createAssetPreview<T extends Asset>(
  assetType: new (asset: T, options: AssetPreviewOptions) => AssetPreviewComponent<T>,
  asset: T,
  options: AssetPreviewOptions,
): AssetPreviewComponent<T> {
  return new assetType(asset, options);
}

/**
 * Helper function to create a control group element
 * @param labelText The label text
 * @param controlElement The control element
 * @param horizontal Whether the control group should be horizontal
 * @returns The control group element
 */
export function createControlGroup(
  labelText: string,
  controlElement: HTMLElement,
  horizontal: boolean = false,
): HTMLDivElement {
  const group = document.createElement('div');
  group.className = `control-group${horizontal ? ' horizontal' : ''}`;

  const label = document.createElement('label');
  label.textContent = labelText;

  group.appendChild(label);
  group.appendChild(controlElement);

  return group;
}

/**
 * Helper function to create a select element
 * @param id The select element ID
 * @param options The select options
 * @param defaultValue The default selected value
 * @param onChange The change event handler
 * @returns The select element
 */
export function createSelect(
  id: string,
  options: { value: string; label: string }[],
  defaultValue: string,
  onChange: (value: string) => void,
): HTMLSelectElement {
  const select = document.createElement('select');
  select.id = id;

  options.forEach((option) => {
    const optionElement = document.createElement('option');
    optionElement.value = option.value;
    optionElement.textContent = option.label;
    select.appendChild(optionElement);
  });

  select.value = defaultValue;
  select.addEventListener('change', () => onChange(select.value));

  return select;
}

/**
 * Helper function to create a range input element
 * @param id The input element ID
 * @param min The minimum value
 * @param max The maximum value
 * @param step The step value
 * @param defaultValue The default value
 * @param onChange The change event handler
 * @returns The range input element
 */
export function createRange(
  id: string,
  min: number,
  max: number,
  step: number,
  defaultValue: number,
  onChange: (value: number) => void,
): HTMLInputElement {
  const range = document.createElement('input');
  range.type = 'range';
  range.id = id;
  range.min = min.toString();
  range.max = max.toString();
  range.step = step.toString();
  range.value = defaultValue.toString();

  range.addEventListener('input', () => onChange(parseFloat(range.value)));

  return range;
}

/**
 * Helper function to create a button element
 * @param id The button element ID
 * @param text The button text
 * @param onClick The click event handler
 * @param className Additional class names
 * @returns The button element
 */
export function createButton(id: string, text: string, onClick: () => void, className: string = ''): HTMLButtonElement {
  const button = document.createElement('button');
  button.id = id;
  button.textContent = text;
  button.className = `btn ${className}`;

  button.addEventListener('click', onClick);

  return button;
}
