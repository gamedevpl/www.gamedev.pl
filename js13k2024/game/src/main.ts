import { Intro } from './game-states/intro/intro';
import { Instructions } from './game-states/instructions/instructions';
import { Gameplay } from './game-states/gameplay/gameplay';
import { GameOver } from './game-states/game-over/game-over';
import { LevelComplete } from './game-states/level-complete/level-complete';
import { LevelStory } from './game-states/level-story/level-story';
import { soundEngine } from './sound/sound-engine';
import { clearElement, createDiv } from './utils/dom';
import './global-styles.css';

enum GameState {
  Intro,
  Instructions,
  LevelStory,
  Gameplay,
  GameOver,
  LevelComplete,
  GameComplete
}

export class MonsterStepsApp {
  private container: HTMLElement;
  private gameState: GameState;
  private level: number;
  private score: number;
  private steps: number;
  private currentScreen: any; // This will hold the current screen object

  constructor(container: HTMLElement) {
    this.container = container;
    this.gameState = GameState.Intro;
    this.level = parseInt(document.location.hash.split('level')[1] ?? '1');
    this.score = 0;
    this.steps = 0;
    this.currentScreen = null;
  }

  init() {
    this.addKeyboardListeners();
    this.renderCurrentState();
  }

  private addKeyboardListeners() {
    document.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        switch (this.gameState) {
          case GameState.Intro:
            this.startGame();
            break;
          case GameState.LevelComplete:
            this.nextLevel();
            break;
          case GameState.GameOver:
            this.restartLevel();
            break;
          case GameState.GameComplete:
            this.restartGame();
            break;
        }
      } else if (e.key === 'Escape') {
        if (
          this.gameState === GameState.Instructions ||
          this.gameState === GameState.GameOver ||
          this.gameState === GameState.GameComplete
        ) {
          this.quitGame();
        }
      }
    });
  }

  private renderCurrentState() {
    clearElement(this.container);
    let screenElement: HTMLElement;

    switch (this.gameState) {
      case GameState.Intro:
        this.currentScreen = new Intro(this.startGame.bind(this), this.showInstructions.bind(this));
        break;
      case GameState.Instructions:
        this.currentScreen = new Instructions(this.quitGame.bind(this));
        break;
      case GameState.LevelStory:
        this.currentScreen = new LevelStory(
          this.level,
          this.startGameplay.bind(this)
        );
        break;
      case GameState.Gameplay:
        this.currentScreen = new Gameplay(
          this.level,
          this.score,
          this.gameOver.bind(this),
          this.levelComplete.bind(this),
          this.gameComplete.bind(this),
          this.updateScore.bind(this),
          this.updateSteps.bind(this)
        );
        break;
      case GameState.GameOver:
        this.currentScreen = new GameOver(
          this.score,
          this.steps,
          this.restartLevel.bind(this),
          this.quitGame.bind(this)
        );
        break;
      case GameState.LevelComplete:
        this.currentScreen = new LevelComplete(
          this.level,
          this.nextLevel.bind(this),
          this.quitGame.bind(this)
        );
        break;
      case GameState.GameComplete:
        this.currentScreen = new GameComplete(
          this.score,
          this.steps,
          this.restartGame.bind(this),
          this.quitGame.bind(this)
        );
        break;
    }

    screenElement = this.currentScreen.render();
    this.container.appendChild(screenElement);
  }

  private startGame() {
    this.gameState = GameState.LevelStory;
    this.renderCurrentState();
  }

  private startGameplay() {
    this.gameState = GameState.Gameplay;
    this.renderCurrentState();
  }

  private showInstructions() {
    this.gameState = GameState.Instructions;
    this.renderCurrentState();
  }

  private restartGame() {
    this.level = 1;
    this.score = 0;
    this.steps = 0;
    this.gameState = GameState.LevelStory;
    this.renderCurrentState();
  }

  private restartLevel() {
    this.gameState = GameState.LevelStory;
    this.renderCurrentState();
  }

  private quitGame() {
    this.gameState = GameState.Intro;
    this.renderCurrentState();
  }

  private gameOver() {
    this.gameState = GameState.GameOver;
    this.renderCurrentState();
  }

  private levelComplete() {
    this.level++;
    this.gameState = GameState.LevelComplete;
    this.renderCurrentState();
  }

  private nextLevel() {
    this.gameState = GameState.LevelStory;
    this.renderCurrentState();
  }

  private gameComplete() {
    soundEngine.playLevelComplete(); // We can reuse the level complete sound for game completion
    this.gameState = GameState.GameComplete;
    this.renderCurrentState();
  }

  private updateScore(newScore: number) {
    this.score = newScore;
  }

  private updateSteps(newSteps: number) {
    this.steps = newSteps;
  }
}

class GameComplete {
  private score: number;
  private steps: number;
  private onPlayAgain: () => void;
  private onQuit: () => void;

  constructor(score: number, steps: number, onPlayAgain: () => void, onQuit: () => void) {
    this.score = score;
    this.steps = steps;
    this.onPlayAgain = onPlayAgain;
    this.onQuit = onQuit;
  }

  render(): HTMLElement {
    const container = createDiv('game-complete intro');
    
    const title = document.createElement('h1');
    title.className = 'game-title';
    title.textContent = 'Monster Steps';
    
    const subtitle = document.createElement('h2');
    subtitle.className = 'game-complete-subtitle';
    subtitle.textContent = 'Congratulations!';
    
    const stats = createDiv('game-complete-stats');
    stats.innerHTML = `
      <p>Final Score: ${this.score}</p>
      <p>Total Steps: ${this.steps}</p>
    `;
    
    const buttons = createDiv('intro-buttons');
    const playAgainButton = document.createElement('button');
    playAgainButton.textContent = 'Play Again';
    playAgainButton.onclick = this.onPlayAgain;
    
    const quitButton = document.createElement('button');
    quitButton.textContent = 'Quit';
    quitButton.onclick = this.onQuit;
    
    buttons.appendChild(playAgainButton);
    buttons.appendChild(quitButton);
    
    const tip = document.createElement('p');
    tip.className = 'intro-tip';
    tip.textContent = 'Press right arrow to play again';
    
    container.appendChild(title);
    container.appendChild(subtitle);
    container.appendChild(stats);
    container.appendChild(buttons);
    container.appendChild(tip);
    
    return container;
  }
}