interface LevelCompleteResult {
  html: string;
  setup: () => void;
}

export function renderLevelComplete(level: number, onNextLevel: () => void, onQuit: () => void): LevelCompleteResult {
  const levelCompleteHtml = `
    <div class="level-complete">
      <h1>Level ${level} Complete!</h1>
      <p>Congratulations! You've completed the level.</p>
      <button id="nextLevelButton">Next Level</button>
      <button id="quitButton">Quit</button>
    </div>
  `;

  return {
    html: levelCompleteHtml,
    setup: () => {
      const nextLevelButton = document.getElementById('nextLevelButton');
      const quitButton = document.getElementById('quitButton');
      
      if (nextLevelButton) {
        nextLevelButton.addEventListener('click', onNextLevel);
      }
      if (quitButton) {
        quitButton.addEventListener('click', onQuit);
      }
    }
  };
}