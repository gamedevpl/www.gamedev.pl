import { FunctionComponent, useEffect, useRef } from 'preact/compat';
import { drawGameState } from '../gameplay/game-render';
import { drawGrid } from '../gameplay/grid-render';
import { GameState, GridSize, BonusType } from '../gameplay/gameplay-types';

const PREVIEW_WIDTH = 300;
const PREVIEW_HEIGHT = 200;
const GRID_SIZE: GridSize = { width: 5, height: 5 };
const CELL_SIZE = Math.min(PREVIEW_WIDTH / GRID_SIZE.width, PREVIEW_HEIGHT / GRID_SIZE.height) / 2;

const createPreviewGameState = (): GameState => ({
  player: {
    position: { x: 2, y: 2 },
    previousPosition: { x: 2, y: 2 },
    moveTimestamp: Date.now(),
    isInvisible: false,
    isVictorious: false,
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
    },
    {
      position: { x: 4, y: 0 },
      previousPosition: { x: 4, y: 0 },
      moveTimestamp: Date.now(),
      path: [],
      seed: Math.random(),
      isConfused: false,
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
  crusherActive: false,
  builderActive: false,
  score: 0,
  isLevelComplete: false,
  isGameOver: false,
});

export const GamePreview: FunctionComponent = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameStateRef = useRef<GameState>(createPreviewGameState());

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const animate = () => {
      ctx.clearRect(0, 0, PREVIEW_WIDTH, PREVIEW_HEIGHT);

      ctx.save();
      ctx.scale(0.8, 0.8);
      ctx.translate(PREVIEW_WIDTH * 0.1, PREVIEW_HEIGHT * 0.1);

      drawGrid(ctx, GRID_SIZE.width, GRID_SIZE.height);
      drawGameState(ctx, gameStateRef.current, GRID_SIZE, CELL_SIZE);

      ctx.restore();

      // Animate monsters
      gameStateRef.current.monsters.forEach((monster) => {
        const newX = monster.position.x + (Math.random() - 0.5) * 0.1;
        const newY = monster.position.y + (Math.random() - 0.5) * 0.1;
        monster.previousPosition = { ...monster.position };
        monster.position = {
          x: Math.max(0, Math.min(GRID_SIZE.width - 1, newX)),
          y: Math.max(0, Math.min(GRID_SIZE.height - 1, newY)),
        };
        monster.moveTimestamp = Date.now();
      });

      requestAnimationFrame(animate);
    };

    animate();
  }, []);

  return <canvas ref={canvasRef} width={PREVIEW_WIDTH} height={PREVIEW_HEIGHT} />;
};
