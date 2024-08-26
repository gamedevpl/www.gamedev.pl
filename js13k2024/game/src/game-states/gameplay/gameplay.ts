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
import { GameState, LevelConfig } from './gameplay-types';

const MAX_LEVEL = 13;
const ANIMATION_DURATION = 2000; // 2 seconds for ending animations

let gameState: GameState;
let levelConfig: LevelConfig;
let hud: HUD;
let canvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;
let animationFrameId: number | null = null;
let onGameOver: () => void;
let onLevelComplete: () => void;
let onGameComplete: () => void;
let updateScore: (newScore: number) => void;
let updateSteps: (newSteps: number) => void;

export function initializeGameplay(
  level: number,
  score: number,
  gameOverCallback: () => void,
  levelCompleteCallback: () => void,
  gameCompleteCallback: () => void,
  updateScoreCallback: (newScore: number) => void,
  updateStepsCallback: (newSteps: number) => void,
): void {
  [gameState, levelConfig] = generateLevel(level);
  hud = new HUD(level, score, gameState.monsterSpawnSteps);
  onGameOver = gameOverCallback;
  onLevelComplete = levelCompleteCallback;
  onGameComplete = gameCompleteCallback;
  updateScore = updateScoreCallback;
  updateSteps = updateStepsCallback;

  addWindowEventHandler('keydown', handleKeyDown);
}

export function renderGameplay() {
  return {
    html: '<div class="gameplay"></div>',
    setup() {
      const container = document.querySelector('.gameplay')!;
      container.appendChild(hud.render());
      const canvasContainer = createDiv('canvas-container');
      canvas = createElement('canvas');
      ctx = canvas.getContext('2d')!;
      canvasContainer.appendChild(canvas);
      container.appendChild(canvasContainer);

      initializeCanvas();
      startGameLoop();
      addEventListeners();
    },
  };
}

function initializeCanvas() {
  const isometricWidth = (levelConfig.gridSize + levelConfig.gridSize) * levelConfig.cellSize;
  const isometricHeight = ((levelConfig.gridSize + levelConfig.gridSize) * levelConfig.cellSize) / 2;
  canvas.width = isometricWidth;
  canvas.height = isometricHeight + 100; // Add extra space for the platform
}

function startGameLoop() {
  const animate = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    drawGameState(ctx, gameState, levelConfig);

    if (!isGameEnding(gameState)) {
      drawMoveArrows(ctx, getValidMoves(gameState, levelConfig), levelConfig.gridSize, levelConfig.cellSize);
    }

    animationFrameId = requestAnimationFrame(animate);
  };

  animate();
}

function addEventListeners() {
  addEventHandler(canvas, 'click', handleClick);
}

function handleKeyDown(e: KeyboardEvent) {
  if (!isGameEnding(gameState)) {
    const newGameState = handleKeyPress(e, gameState, levelConfig);
    updateGameState(newGameState);
  }
}

function handleClick(e: MouseEvent) {
  if (isGameEnding(gameState)) return;

  const rect = canvas.getBoundingClientRect();
  const clickedMove = getMoveFromClick(
    (e.clientX - rect.left) * (canvas.width / rect.width) - canvas.width / 2,
    (e.clientY - rect.top) * (canvas.height / rect.height) - 100,
    gameState,
    levelConfig,
  );

  if (clickedMove) {
    updateGameState(doGameUpdate(clickedMove.direction, gameState, levelConfig));
  }
}

function updateGameState(newGameState: GameState) {
  gameState = newGameState;
  updateScore(newGameState.score);
  updateSteps(newGameState.steps);
  hud.update(levelConfig.levelNumber, newGameState.score, newGameState.monsterSpawnSteps);

  if (newGameState.gameEndingState !== 'none') {
    setTimeout(() => {
      if (newGameState.gameEndingState === 'levelComplete') {
        if (levelConfig.levelNumber === MAX_LEVEL) {
          onGameComplete();
        } else {
          onLevelComplete();
        }
      }

      if (newGameState.gameEndingState === 'gameOver') {
        onGameOver();
      }
    }, ANIMATION_DURATION);
  }
}

export function destroyGameplay() {
  if (animationFrameId !== null) {
    cancelAnimationFrame(animationFrameId);
  }
  removeWindowEventHandler('keydown', handleKeyDown);
}
