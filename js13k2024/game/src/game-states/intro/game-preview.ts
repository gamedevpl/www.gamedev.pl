import { createElement } from '../../utils/dom';
import { drawGameState } from '../gameplay/game-render';
import { drawGrid } from '../gameplay/render/grid-render';
import { GameState, BonusType } from '../gameplay/gameplay-types';

const PREVIEW_WIDTH = 300;
const PREVIEW_HEIGHT = 200;
const GRID_SIZE = 5;
const CELL_SIZE = Math.min(PREVIEW_WIDTH / GRID_SIZE, PREVIEW_HEIGHT / GRID_SIZE) / 2;

// Define a custom interface for the container element
interface GamePreviewContainer extends HTMLDivElement {
  stopAnimation?: () => void;
}

export function createGamePreview(): GamePreviewContainer {
  const container = createElement('div') as GamePreviewContainer;
  container.className = 'game-preview';
  const canvas = createElement('canvas') as HTMLCanvasElement;
  canvas.width = PREVIEW_WIDTH;
  canvas.height = PREVIEW_HEIGHT;
  container.appendChild(canvas);

  const ctx = canvas.getContext('2d')!;
  const gameState = createPreviewGameState();

  let animationFrameId: number | null = null;

  function startAnimation() {
    const animate = () => {
      ctx.clearRect(0, 0, PREVIEW_WIDTH, PREVIEW_HEIGHT);

      ctx.save();
      ctx.scale(0.8, 0.8);
      ctx.translate(PREVIEW_WIDTH * 0.1, PREVIEW_HEIGHT * 0.1);

      drawGrid(ctx, GRID_SIZE, gameState);
      drawGameState(ctx, gameState, {
        gridSize: GRID_SIZE,
        cellSize: CELL_SIZE,
        initialMonsterCount: 0,
        monsterSpawnSectors: [],
        obstacleCount: 0,
        initialBonusCount: 0,
        levelNumber: 1,
        levelName: 'Preview',
        levelStory: 'Preview',
        levelUpdater: () => {},
      });

      ctx.restore();

      // Animate monsters
      gameState.monsters.forEach((monster) => {
        const newX = monster.position.x + (Math.random() - 0.5) * 0.1;
        const newY = monster.position.y + (Math.random() - 0.5) * 0.1;
        monster.previousPosition = { ...monster.position };
        monster.position = {
          x: Math.max(0, Math.min(GRID_SIZE - 1, newX)),
          y: Math.max(0, Math.min(GRID_SIZE - 1, newY)),
        };
        monster.moveTimestamp = Date.now();
      });

      animationFrameId = requestAnimationFrame(animate);
    };

    animate();
  }

  function stopAnimation() {
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
    }
  }

  startAnimation();

  // Expose a method to stop the animation when the component is no longer needed
  container.stopAnimation = stopAnimation;

  return container;
}

function createPreviewGameState(): GameState {
  return {
    player: {
      position: { x: 2, y: 2 },
      previousPosition: { x: 2, y: 2 },
      moveTimestamp: Date.now(),
      isVictorious: false,
      isVanishing: false,
    },
    goal: { x: 4, y: 4 },
    obstacles: [
      { position: { x: 1, y: 1 }, creationTime: Date.now(), isRaising: false, isDestroying: false },
      { position: { x: 3, y: 3 }, creationTime: Date.now(), isRaising: false, isDestroying: false },
    ],
    monsters: [
      {
        position: { x: 0, y: 4 },
        previousPosition: { x: 0, y: 4 },
        moveTimestamp: Date.now(),
        path: [],
        seed: Math.random(),
        isConfused: false,
        spawnPoint: { x: 0, y: 4 },
      },
      {
        position: { x: 4, y: 0 },
        previousPosition: { x: 4, y: 0 },
        moveTimestamp: Date.now(),
        path: [],
        seed: Math.random(),
        isConfused: false,
        spawnPoint: { x: 4, y: 0 },
      },
    ],
    steps: 0,
    monsterSpawnSteps: 0,
    bonuses: [
      { type: BonusType.CapOfInvisibility, position: { x: 1, y: 3 } },
      { type: BonusType.ConfusedMonsters, position: { x: 3, y: 1 } },
    ],
    activeBonuses: [],
    explosions: [],
    timeBombs: [],
    landMines: [],
    score: 0,
    gameEndingState: 'none',
    tsunamiLevel: 0,
    blasterShots: [],
  };
}