interface IntroResult {
  html: string;
  setup: () => void;
}

export function renderIntro(onStart: () => void): IntroResult {
  const introHtml = `
    <div class="intro">
      <h1 class="game-title">Monster Steps</h1>
      <div class="game-intro-responsive">
        <div class="game-intro-column">
          <div class="intro-buttons">
            <button id="startButton">Start Game</button>
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
      if (startButton) {
        startButton.addEventListener('click', onStart);
      }
    }
  };
}