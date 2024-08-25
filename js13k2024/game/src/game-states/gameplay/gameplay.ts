import {
  createElement,
  createDiv,
  addEventHandler,
  addWindowEventHandler,
  removeWindowEventHandler,
} from '../../utils/dom';
import { drawGameState } from './game-render';
import { drawMoveArrows } from './render/move-arrows-render';
import { doGameUpdate, handleKeyPress, isGameEnding } from './game-logic';
import { getMoveFromClick, getValidMoves } from './move-utils';
import { HUD } from './hud';
import { generateLevel } from './level-generator';
import { GameState } from './gameplay-types';

const MAX_LEVEL = 13;
const ANIMATION_DURATION = 2000; // 2 seconds for ending animations

export class Gameplay {
  private level: number;
  private onGameOver: () => void;
  private onLevelComplete: () => void;
  private onGameComplete: () => void;
  private updateScore: (newScore: number) => void;
  private updateSteps: (newSteps: number) => void;

  private container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private gameState: GameState;
  private levelConfig: any;
  private hud: HUD;
  private animationFrameId: number | null = null;

  constructor(
    level: number,
    score: number,
    onGameOver: () => void,
    onLevelComplete: () => void,
    onGameComplete: () => void,
    updateScore: (newScore: number) => void,
    updateSteps: (newSteps: number) => void,
  ) {
    this.level = level;
    this.onGameOver = onGameOver;
    this.onLevelComplete = onLevelComplete;
    this.onGameComplete = onGameComplete;
    this.updateScore = updateScore;
    this.updateSteps = updateSteps;

    this.container = createDiv('gameplay');
    this.canvas = createElement('canvas');
    this.ctx = this.canvas.getContext('2d')!;
    [this.gameState, this.levelConfig] = generateLevel(level);
    this.hud = new HUD(level, score, this.gameState.monsterSpawnSteps);
    addWindowEventHandler('keydown', this.handleKeyDown);
  }

  render(): HTMLElement {
    this.container.innerHTML = '';
    this.container.appendChild(this.hud.render());

    const canvasContainer = createDiv('canvas-container');
    canvasContainer.appendChild(this.canvas);
    this.container.appendChild(canvasContainer);

    this.initializeCanvas();
    this.startGameLoop();
    this.addEventListeners();

    return this.container;
  }

  private initializeCanvas() {
    const isometricWidth = (this.levelConfig.gridSize + this.levelConfig.gridSize) * this.levelConfig.cellSize;
    const isometricHeight = ((this.levelConfig.gridSize + this.levelConfig.gridSize) * this.levelConfig.cellSize) / 2;
    this.canvas.width = isometricWidth;
    this.canvas.height = isometricHeight + 100; // Add extra space for the platform
  }

  private startGameLoop() {
    const animate = () => {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

      drawGameState(this.ctx, this.gameState, this.levelConfig);

      if (!isGameEnding(this.gameState)) {
        drawMoveArrows(
          this.ctx,
          getValidMoves(this.gameState, this.levelConfig),
          this.levelConfig.gridSize,
          this.levelConfig.cellSize,
        );
      }

      this.animationFrameId = requestAnimationFrame(animate);
    };

    animate();
  }

  private addEventListeners() {
    addEventHandler(this.canvas, 'click', this.handleClick.bind(this));
  }

  handleKeyDown = (e: KeyboardEvent) => {
    if (!isGameEnding(this.gameState)) {
      const newGameState = handleKeyPress(e, this.gameState, this.levelConfig);
      this.updateGameState(newGameState);
    }
  };

  private handleClick(e: MouseEvent) {
    if (isGameEnding(this.gameState)) return;

    const rect = this.canvas.getBoundingClientRect();
    const clickedMove = getMoveFromClick(
      (e.clientX - rect.left) * (this.canvas.width / rect.width) - this.canvas.width / 2,
      (e.clientY - rect.top) * (this.canvas.height / rect.height) - 100,
      this.gameState,
      this.levelConfig,
    );

    if (clickedMove) {
      this.updateGameState(doGameUpdate(clickedMove.direction, this.gameState, this.levelConfig));
    }
  }

  private updateGameState(newGameState: GameState) {
    this.gameState = newGameState;
    this.updateScore(newGameState.score);
    this.updateSteps(newGameState.steps);
    this.hud.update(this.level, newGameState.score, newGameState.monsterSpawnSteps);

    if (newGameState.gameEndingState !== 'none') {
      setTimeout(() => {
        if (newGameState.gameEndingState === 'levelComplete') {
          if (this.level === MAX_LEVEL) {
            this.onGameComplete();
          } else {
            this.onLevelComplete();
          }
        }

        if (newGameState.gameEndingState === 'gameOver') {
          this.onGameOver();
        }
      }, ANIMATION_DURATION);
    }
  }

  destroy() {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }
    removeWindowEventHandler('keydown', this.handleKeyDown);
  }
}