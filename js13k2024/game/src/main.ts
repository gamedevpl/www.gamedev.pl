import { clearElement } from './utils/dom';
import { playEffect, SoundEffect } from './sound/sound-engine';
import { renderIntro } from './game-states/intro/intro';
import { initializeGameplay, renderGameplay } from './game-states/gameplay/gameplay';
import { renderGameOver } from './game-states/game-over/game-over';
import { renderLevelComplete } from './game-states/level-complete/level-complete';
import { renderLevelStory } from './game-states/level-story/level-story';
import './global-styles.css';

enum GameState {
  Intro,
  LevelStory,
  Gameplay,
  GameOver,
  LevelComplete,
  GameComplete,
}

const gameState = {
  currentState: GameState.Intro,
  level: 1,
  score: 0,
  steps: 0,
  container: null as HTMLElement | null,
};

function updateGameState(newState: Partial<typeof gameState>) {
  Object.assign(gameState, newState);
  if (newState.currentState) {
    renderCurrentState();
  }
}

let currentState: { html: string; setup: () => void; cleanup?: () => void };
function renderCurrentState() {
  if (!gameState.container) return;

  clearElement(gameState.container);
  if (currentState?.cleanup) {
    currentState.cleanup();
  }

  switch (gameState.currentState) {
    case GameState.Intro:
      currentState = renderIntro(startGame);
      break;
    case GameState.LevelStory:
      currentState = renderLevelStory(gameState.level, startGameplay);
      break;
    case GameState.Gameplay:
      currentState = renderGameplay();
      break;
    case GameState.GameOver:
      currentState = renderGameOver(gameState.score, gameState.steps, restartLevel, quitGame);
      break;
    case GameState.LevelComplete:
      currentState = renderLevelComplete(gameState.level, nextLevel, quitGame);
      break;
    case GameState.GameComplete:
      currentState = renderGameComplete();
      break;
  }

  gameState.container.innerHTML = currentState.html;
  currentState.setup();
}

function startGame() {
  updateGameState({ currentState: GameState.LevelStory });
}

function startGameplay() {
  initializeGameplay(gameState.level, gameState.score, gameOver, levelComplete, gameComplete, updateScore, updateSteps);
  updateGameState({ currentState: GameState.Gameplay });
}

function restartGame() {
  updateGameState({
    currentState: GameState.LevelStory,
    level: 1,
    score: 0,
    steps: 0,
  });
}

function restartLevel() {
  updateGameState({ currentState: GameState.LevelStory });
}

function quitGame() {
  updateGameState({ currentState: GameState.Intro });
}

function gameOver() {
  updateGameState({ currentState: GameState.GameOver });
}

function levelComplete() {
  updateGameState({
    currentState: GameState.LevelComplete,
    level: gameState.level + 1,
  });
}

function nextLevel() {
  updateGameState({ currentState: GameState.LevelStory });
}

function gameComplete() {
  playEffect(SoundEffect.LevelComplete);
  updateGameState({ currentState: GameState.GameComplete });
}

function updateScore(newScore: number) {
  updateGameState({ score: newScore });
}

function updateSteps(newSteps: number) {
  updateGameState({ steps: newSteps });
}

function renderGameComplete(): { html: string; setup: () => void } {
  const html = `
    <div class="game-complete intro">
      <h1 class="game-title">Monster Steps</h1>
      <h2 class="game-complete-subtitle">Congratulations!</h2>
      <div class="game-complete-stats">
        <p>Final Score: ${gameState.score}</p>
        <p>Total Steps: ${gameState.steps}</p>
      </div>
      <div class="intro-buttons">
        <button id="playAgainButton">Play Again</button>
        <button id="quitButton">Quit</button>
      </div>
      <p class="intro-tip">Press right arrow to play again</p>
    </div>
  `;

  const setup = () => {
    const playAgainButton = document.getElementById('playAgainButton');
    const quitButton = document.getElementById('quitButton');

    if (playAgainButton) {
      playAgainButton.addEventListener('click', restartGame);
    }
    if (quitButton) {
      quitButton.addEventListener('click', quitGame);
    }
  };

  return { html, setup };
}

function addKeyboardListeners() {
  document.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') {
      switch (gameState.currentState) {
        case GameState.Intro:
          startGame();
          break;
        case GameState.LevelComplete:
          nextLevel();
          break;
        case GameState.GameOver:
          restartLevel();
          break;
        case GameState.GameComplete:
          restartGame();
          break;
      }
    } else if (e.key === 'Escape') {
      if (gameState.currentState === GameState.GameOver || gameState.currentState === GameState.GameComplete) {
        quitGame();
      }
    }
  });
}

export function initGame(container: HTMLElement) {
  gameState.container = container;
  gameState.level = parseInt(document.location.hash.split('level')[1] ?? '1');

  addKeyboardListeners();
  renderCurrentState();
}
