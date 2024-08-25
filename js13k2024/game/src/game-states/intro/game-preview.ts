import { createElement } from '../../utils/dom';
import { drawGameState } from '../gameplay/game-render';
import { drawGrid } from '../gameplay/render/grid-render';
import { GameState, BonusType } from '../gameplay/gameplay-types';

const PREVIEW_WIDTH = 300;
const PREVIEW_HEIGHT = 200;
const GRID_SIZE = 5;
const CELL_SIZE = Math.min(PREVIEW_WIDTH / GRID_SIZE, PREVIEW_HEIGHT / GRID_SIZE) / 2;

export class GamePreview {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private gameState: GameState;
  private animationFrameId: number | null = null;

  constructor() {
    this.canvas = createElement('canvas') as HTMLCanvasElement;
    this.canvas.width = PREVIEW_WIDTH;
    this.canvas.height = PREVIEW_HEIGHT;
    this.ctx = this.canvas.getContext('2d')!;
    this.gameState = this.createPreviewGameState();
  }

  render(): HTMLCanvasElement {
    this.startAnimation();
    return this.canvas;
  }

  private startAnimation() {
    const animate = () => {
      this.ctx.clearRect(0, 0, PREVIEW_WIDTH, PREVIEW_HEIGHT);

      this.ctx.save();
      this.ctx.scale(0.8, 0.8);
      this.ctx.translate(PREVIEW_WIDTH * 0.1, PREVIEW_HEIGHT * 0.1);

      drawGrid(this.ctx, GRID_SIZE, this.gameState);
      drawGameState(this.ctx, this.gameState, {
        gridSize: GRID_SIZE,
        cellSize: CELL_SIZE,
        initialMonsterCount: 0,
        monsterSpawnSectors: [],
        obstacleCount: 0,
        initialBonusCount: 0,
        levelName: 'Preview',
        levelStory: 'Preview',
        levelUpdater: () => {},
      });

      this.ctx.restore();

      // Animate monsters
      this.gameState.monsters.forEach((monster) => {
        const newX = monster.position.x + (Math.random() - 0.5) * 0.1;
        const newY = monster.position.y + (Math.random() - 0.5) * 0.1;
        monster.previousPosition = { ...monster.position };
        monster.position = {
          x: Math.max(0, Math.min(GRID_SIZE - 1, newX)),
          y: Math.max(0, Math.min(GRID_SIZE - 1, newY)),
        };
        monster.moveTimestamp = Date.now();
      });

      this.animationFrameId = requestAnimationFrame(animate);
    };

    animate();
  }

  private createPreviewGameState(): GameState {
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

  destroy() {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }
  }
}