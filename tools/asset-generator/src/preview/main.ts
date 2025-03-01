/**
 * Asset Generator Preview
 *
 * Main entry point for the asset preview application.
 * This file initializes the preview interface and handles user interactions.
 */

import './styles.css';
import { createLion2dPreview } from './components/lion-preview';
import { AssetPreviewComponent } from './components/asset-preview';
import { Asset } from '../assets/assets-types';

// Define the available asset types
type AssetType = 'lion-2d';

// Store the current preview component
let currentPreview: AssetPreviewComponent<Asset> | null = null;

// DOM Elements
let canvas: HTMLCanvasElement;
let assetSelector: HTMLSelectElement;
let assetControls: HTMLElement;
let animationSpeedInput: HTMLInputElement;
let animationSpeedValue: HTMLElement;
let playPauseButton: HTMLButtonElement;
let resetButton: HTMLButtonElement;

/**
 * Initialize the preview application
 */
function initializePreview(): void {
  // Get DOM elements
  canvas = document.getElementById('preview-canvas') as HTMLCanvasElement;
  assetSelector = document.getElementById('asset-selector') as HTMLSelectElement;
  assetControls = document.getElementById('asset-controls') as HTMLElement;
  animationSpeedInput = document.getElementById('animation-speed') as HTMLInputElement;
  animationSpeedValue = document.getElementById('animation-speed-value') as HTMLElement;
  playPauseButton = document.getElementById('play-pause-btn') as HTMLButtonElement;
  resetButton = document.getElementById('reset-btn') as HTMLButtonElement;

  // Set up event listeners
  assetSelector.addEventListener('change', handleAssetChange);
  animationSpeedInput.addEventListener('input', handleSpeedChange);
  playPauseButton.addEventListener('click', togglePlayPause);
  resetButton.addEventListener('click', resetAnimation);

  // Initialize with the default asset
  const initialAsset = assetSelector.value as AssetType;
  loadAssetPreview(initialAsset);

  // Handle window resize
  window.addEventListener('resize', handleWindowResize);
}

/**
 * Load an asset preview
 * @param assetType The type of asset to preview
 */
function loadAssetPreview(assetType: AssetType): void {
  // Dispose of the current preview if it exists
  if (currentPreview) {
    currentPreview.dispose();
    currentPreview = null;
  }

  // Create a new preview based on the asset type
  switch (assetType) {
    case 'lion-2d':
      currentPreview = createLion2dPreview({
        canvas,
        controlsContainer: assetControls,
        animationSpeed: parseFloat(animationSpeedInput.value),
        autoPlay: true,
        backgroundColor: 'white',
      });
      break;
    default:
      console.error(`Unknown asset type: ${assetType}`);
      return;
  }

  currentPreview.initialize();

  // Set up event handlers
  currentPreview.setEvents({
    onPlay: () => {
      playPauseButton.textContent = 'Pause';
    },
    onPause: () => {
      playPauseButton.textContent = 'Play';
    },
    onReset: () => {
      console.log('Animation reset');
    },
    onRender: () => {
      // Update UI if needed on each render
    },
  });

  // Update UI to reflect the current state
  updateUIState();
}

/**
 * Handle asset type change
 */
function handleAssetChange(): void {
  const assetType = assetSelector.value as AssetType;
  loadAssetPreview(assetType);
}

/**
 * Handle animation speed change
 */
function handleSpeedChange(): void {
  const speed = parseFloat(animationSpeedInput.value);
  animationSpeedValue.textContent = speed.toFixed(1);

  if (currentPreview) {
    currentPreview.setAnimationSpeed(speed);
  }
}

/**
 * Toggle play/pause state
 */
function togglePlayPause(): void {
  if (!currentPreview) return;

  if (currentPreview.isAnimationPlaying()) {
    currentPreview.pause();
    playPauseButton.textContent = 'Play';
  } else {
    currentPreview.play();
    playPauseButton.textContent = 'Pause';
  }
}

/**
 * Reset the animation
 */
function resetAnimation(): void {
  if (currentPreview) {
    currentPreview.reset();
  }
}

/**
 * Handle window resize
 */
function handleWindowResize(): void {
  // The asset preview component handles canvas resizing internally
  // This function is for additional resize handling if needed
}

/**
 * Update UI state based on the current preview
 */
function updateUIState(): void {
  if (!currentPreview) return;

  // Update animation speed
  const speed = currentPreview.getAnimationSpeed();
  animationSpeedInput.value = speed.toString();
  animationSpeedValue.textContent = speed.toFixed(1);

  // Update play/pause button
  playPauseButton.textContent = currentPreview.isAnimationPlaying() ? 'Pause' : 'Play';
}

// Initialize the preview when the DOM is loaded
document.addEventListener('DOMContentLoaded', initializePreview);

// Export for potential use in other modules
export { initializePreview, loadAssetPreview };
