import { FunctionComponent, useEffect, useRef } from 'react';
import { drawGameState } from '../gameplay/game-render';
import { drawGrid } from '../gameplay/render/grid-render';
import { GameState, BonusType } from '../gameplay/gameplay-types';

const PREVIEW_WIDTH = 300;
const PREVIEW_HEIGHT = 200;
const GRID_SIZE = 5;
const CELL_SIZE = Math.min(PREVIEW_WIDTH / GRID_SIZE, PREVIEW_HEIGHT / GRID_SIZE) / 2;

const createPreviewGameState = (): GameState => ({
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

      drawGrid(ctx, GRID_SIZE, gameStateRef.current);
      drawGameState(ctx, gameStateRef.current, {
        gridSize: GRID_SIZE,
        cellSize: CELL_SIZE,
        initialMonsterCount: 0,
        monsterSpawnSectors: [],
        obstacleCount: 0,
        initialBonusCount: 0,
        levelNumber: 0,
        levelName: 'Preview',
        levelStory: 'Preview',
        levelUpdater: () => {},
      });

      ctx.restore();

      // Animate monsters
      gameStateRef.current.monsters.forEach((monster) => {
        const newX = monster.position.x + (Math.random() - 0.5) * 0.1;
        const newY = monster.position.y + (Math.random() - 0.5) * 0.1;
        monster.previousPosition = { ...monster.position };
        monster.position = {
          x: Math.max(0, Math.min(GRID_SIZE - 1, newX)),
          y: Math.max(0, Math.min(GRID_SIZE - 1, newY)),
        };
        monster.moveTimestamp = Date.now();
      });

      requestAnimationFrame(animate);
    };

    animate();
  }, []);

  return <canvas ref={canvasRef} width={PREVIEW_WIDTH} height={PREVIEW_HEIGHT} />;
};
