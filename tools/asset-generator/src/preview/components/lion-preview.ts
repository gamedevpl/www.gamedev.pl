/**
 * Lion 2D Preview Component
 *
 * This component extends the generic asset preview component to provide
 * specific functionality for the Lion 2D asset.
 */

import { Lion2d, LionAnimationState } from '../../assets/lion-2d/lion-2d';
import {
  AssetPreviewComponent,
  AssetPreviewOptions,
  createButton,
  createControlGroup,
  createSelect,
} from './asset-preview';

/**
 * Lion 2D Preview Component
 */
export class Lion2dPreview extends AssetPreviewComponent<typeof Lion2d> {
  // Current state of the lion
  private lionState: LionAnimationState = {
    progress: 0,
    stance: 'running',
    direction: 'left',
    scale: 1,
    colorVariant: 'default',
  };

  // UI elements
  private stanceSelect: HTMLSelectElement | null = null;
  private directionSelect: HTMLSelectElement | null = null;
  private scaleRange: HTMLInputElement | null = null;
  private colorOptions: HTMLDivElement | null = null;

  /**
   * Initialize the component
   */
  initialize(): void {
    super.initialize();

    // Set up initial render
    this.render(this.lionState);
  }

  /**
   * Initialize UI controls specific to the Lion 2D asset
   */
  protected initializeControls(): void {
    // Clear existing controls
    this.controlsContainer.innerHTML = '';

    // Create container for lion-specific controls
    const lionControls = document.createElement('div');
    lionControls.className = 'lion-controls';
    lionControls.innerHTML = '<h3>Lion 2D Controls</h3>';

    // Create stance selector
    this.stanceSelect = createSelect(
      'lion-stance',
      [
        { value: 'standing', label: 'Standing' },
        { value: 'walking', label: 'Walking' },
        { value: 'running', label: 'Running' },
        { value: 'sleeping', label: 'Sleeping' },
        { value: 'idle', label: 'Idle' },
      ],
      this.lionState.stance,
      (value) => this.setStance(value as LionAnimationState['stance']),
    );

    lionControls.appendChild(createControlGroup('Stance:', this.stanceSelect));

    // Create direction selector
    this.directionSelect = createSelect(
      'lion-direction',
      [
        { value: 'left', label: 'Left' },
        { value: 'right', label: 'Right' },
      ],
      this.lionState.direction,
      (value) => this.setDirection(value as LionAnimationState['direction']),
    );

    lionControls.appendChild(createControlGroup('Direction:', this.directionSelect));

    // Create scale control
    this.scaleRange = document.createElement('input');
    this.scaleRange.type = 'range';
    this.scaleRange.id = 'lion-scale';
    this.scaleRange.min = '0.5';
    this.scaleRange.max = '2';
    this.scaleRange.step = '0.1';
    this.scaleRange.value = this.lionState.scale?.toString() || '1';

    const scaleValueDisplay = document.createElement('span');
    scaleValueDisplay.id = 'lion-scale-value';
    scaleValueDisplay.textContent = this.scaleRange.value;

    this.scaleRange.addEventListener('input', () => {
      const scale = parseFloat(this.scaleRange.value);
      this.setScale(scale);
      scaleValueDisplay.textContent = scale.toFixed(1);
    });

    const scaleGroup = createControlGroup('Scale:', this.scaleRange);
    scaleGroup.appendChild(scaleValueDisplay);
    lionControls.appendChild(scaleGroup);

    // Create color variant selector
    this.colorOptions = document.createElement('div');
    this.colorOptions.className = 'color-options';

    const colorVariants = [
      { value: 'default', label: 'Default' },
      { value: 'golden', label: 'Golden' },
      { value: 'white', label: 'White' },
    ];

    colorVariants.forEach((variant) => {
      const colorOption = document.createElement('span');
      colorOption.className = `color-option ${variant.value}${
        this.lionState.colorVariant === variant.value ? ' selected' : ''
      }`;
      colorOption.title = variant.label;
      colorOption.setAttribute('data-value', variant.value);

      colorOption.addEventListener('click', () => {
        // Remove selected class from all options
        this.colorOptions?.querySelectorAll('.color-option').forEach((el) => {
          el.classList.remove('selected');
        });

        // Add selected class to clicked option
        colorOption.classList.add('selected');

        // Update color variant
        this.setColorVariant(variant.value as LionAnimationState['colorVariant']);
      });

      this.colorOptions.appendChild(colorOption);
    });

    const colorLabel = document.createElement('label');
    colorLabel.textContent = 'Color Variant:';

    const colorGroup = document.createElement('div');
    colorGroup.className = 'control-group';
    colorGroup.appendChild(colorLabel);
    colorGroup.appendChild(this.colorOptions);

    lionControls.appendChild(colorGroup);

    // Add reset button
    const resetButton = createButton('lion-reset', 'Reset Lion', () => this.resetLion(), 'btn-secondary');

    lionControls.appendChild(resetButton);

    // Add controls to container
    this.controlsContainer.appendChild(lionControls);
  }

  /**
   * Animation frame callback
   * @param deltaTime Time since the last frame in milliseconds
   */
  protected animationFrame(deltaTime: number): void {
    // Update the progress (0.0 to 1.0)
    // Different stances may have different animation speeds
    let speedMultiplier = 1.0;

    switch (this.lionState.stance) {
      case 'running':
        speedMultiplier = 1.5;
        break;
      case 'walking':
        speedMultiplier = 1.0;
        break;
      case 'standing':
        speedMultiplier = 0.5;
        break;
      case 'idle':
        speedMultiplier = 0.3;
        break;
      case 'sleeping':
        speedMultiplier = 0.2;
        break;
    }

    // Update progress based on deltaTime and speed
    const cycleDuration = 5000; // 5 seconds for a full cycle at normal speed
    this.lionState.progress = (this.lionState.progress + (deltaTime * speedMultiplier) / cycleDuration) % 1.0;

    // Render the asset with the current state
    this.render(this.lionState);

    // Call the onRender event
    if (this.events.onRender) {
      this.events.onRender(deltaTime);
    }
  }

  /**
   * Set the lion's stance
   * @param stance The new stance
   */
  public setStance(stance: LionAnimationState['stance']): void {
    this.lionState.stance = stance;

    // Update UI
    if (this.stanceSelect) {
      this.stanceSelect.value = stance;
    }

    // Render with new state
    this.render(this.lionState);
  }

  /**
   * Set the lion's direction
   * @param direction The new direction
   */
  public setDirection(direction: LionAnimationState['direction']): void {
    this.lionState.direction = direction;

    // Update UI
    if (this.directionSelect) {
      this.directionSelect.value = direction;
    }

    // Render with new state
    this.render(this.lionState);
  }

  /**
   * Set the lion's scale
   * @param scale The new scale
   */
  public setScale(scale: number): void {
    this.lionState.scale = scale;

    // Update UI
    if (this.scaleRange) {
      this.scaleRange.value = scale.toString();
    }

    // Render with new state
    this.render(this.lionState);
  }

  /**
   * Set the lion's color variant
   * @param colorVariant The new color variant
   */
  public setColorVariant(colorVariant: LionAnimationState['colorVariant']): void {
    this.lionState.colorVariant = colorVariant;

    // Update UI
    if (this.colorOptions) {
      this.colorOptions.querySelectorAll('.color-option').forEach((el) => {
        el.classList.remove('selected');
        if (el.getAttribute('data-value') === colorVariant) {
          el.classList.add('selected');
        }
      });
    }

    // Render with new state
    this.render(this.lionState);
  }

  /**
   * Reset the lion to default state
   */
  public resetLion(): void {
    this.lionState = {
      progress: 0,
      stance: 'running',
      direction: 'left',
      scale: 1,
      colorVariant: 'default',
    };

    // Update UI
    if (this.stanceSelect) {
      this.stanceSelect.value = this.lionState.stance;
    }

    if (this.directionSelect) {
      this.directionSelect.value = this.lionState.direction;
    }

    if (this.scaleRange) {
      this.scaleRange.value = this.lionState.scale.toString();
      const scaleValueDisplay = document.getElementById('lion-scale-value');
      if (scaleValueDisplay) {
        scaleValueDisplay.textContent = this.lionState.scale.toString();
      }
    }

    if (this.colorOptions) {
      this.colorOptions.querySelectorAll('.color-option').forEach((el) => {
        el.classList.remove('selected');
        if (el.getAttribute('data-value') === this.lionState.colorVariant) {
          el.classList.add('selected');
        }
      });
    }

    // Render with new state
    this.render(this.lionState);

    // Call the onReset event
    if (this.events.onReset) {
      this.events.onReset();
    }
  }

  /**
   * Get the current lion state
   */
  public getLionState(): LionAnimationState {
    return { ...this.lionState };
  }
}

/**
 * Create a Lion 2D preview component
 * @param options Preview options
 * @returns A Lion 2D preview component
 */
export function createLion2dPreview(options: AssetPreviewOptions): Lion2dPreview {
  return new Lion2dPreview(Lion2d, options);
}
