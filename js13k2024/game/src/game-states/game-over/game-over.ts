interface GameOverResult {
  html: string;
  setup: () => void;
}

export function renderGameOver(score: number, steps: number, onTryAgain: () => void, onQuit: () => void): GameOverResult {
  const gameOverHtml = `
    <div class="game-over">
      <h1>Game Over</h1>
      <p>Your score: ${score}</p>
      <p>Steps taken: ${steps}</p>
      <button id="tryAgainButton">Try Again</button>
      <button id="quitButton">Quit</button>
    </div>
  `;

  return {
    html: gameOverHtml,
    setup: () => {
      const tryAgainButton = document.getElementById('tryAgainButton');
      const quitButton = document.getElementById('quitButton');
      
      if (tryAgainButton) {
        tryAgainButton.addEventListener('click', onTryAgain);
      }
      if (quitButton) {
        quitButton.addEventListener('click', onQuit);
      }
    }
  };
}