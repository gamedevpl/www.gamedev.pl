import { createGamePreview } from './game-preview';

interface IntroResult {
  html: string;
  setup: () => void;
}

// Define a custom interface for the game preview element
interface GamePreviewElement extends HTMLElement {
  stopAnimation?: () => void;
}

export function renderIntro(onStart: () => void, onInstructions: () => void): IntroResult {
  const introHtml = `
    <div class="intro">
      <h1 class="game-title">Monster Steps</h1>
      <div class="game-intro-responsive">
        <div id="gamePreviewContainer" class="game-intro-column"></div>
        <div class="game-intro-column">
          <div class="intro-buttons">
            <button id="startButton">Start Game</button>
            <button id="instructionsButton">Instructions</button>
          </div>
          <p class="intro-tip">Press right arrow to start</p>
        </div>
      </div>
      <p class="author-name">
        Created by <a href="https://x.com/gtanczyk">Grzegorz Tańczyk</a> | <a href="https://github.com/gamedevpl/www.gamedev.pl/tree/js13k2024-monster-steps-version/js13k2024">Source code (GitHub)</a>
      </p>
    </div>
  `;

  return {
    html: introHtml,
    setup: () => {
      const startButton = document.getElementById('startButton');
      const instructionsButton = document.getElementById('instructionsButton');
      const gamePreviewContainer = document.getElementById('gamePreviewContainer');

      if (startButton) {
        startButton.addEventListener('click', onStart);
      }

      if (instructionsButton) {
        instructionsButton.addEventListener('click', onInstructions);
      }

      if (gamePreviewContainer) {
        const gamePreview = createGamePreview() as GamePreviewElement;
        gamePreviewContainer.appendChild(gamePreview);

        // Clean up function to stop the animation when the intro is no longer displayed
        return () => {
          if (typeof gamePreview.stopAnimation === 'function') {
            gamePreview.stopAnimation();
          }
          gamePreviewContainer.removeChild(gamePreview);
        };
      }
    },
  };
}
