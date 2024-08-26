import { Position, Bonus, BonusType } from '../gameplay-types';
import { toIsometric, TILE_WIDTH, TILE_HEIGHT } from './isometric-utils';
import { drawShadow } from './grid-render';

const BONUS_HEIGHT = TILE_HEIGHT;

export const drawBonuses = (ctx: CanvasRenderingContext2D, bonuses: Bonus[], cellSize: number) => {
  bonuses.forEach((bonus) => {
    const { x: isoX, y: isoY } = toIsometric(bonus.position.x, bonus.position.y);
    drawShadow(ctx, isoX - TILE_WIDTH / 4, isoY - TILE_HEIGHT / 4, TILE_WIDTH / 2, TILE_HEIGHT);
    drawBonusShape(ctx, isoX, isoY, getBonusColor(bonus.type));
    drawBonusSymbol(ctx, isoX, isoY, cellSize, getBonusSymbol(bonus.type));
  });
};

export const drawLandMines = (ctx: CanvasRenderingContext2D, landMines: Position[], cellSize: number) => {
  landMines.forEach((mine) => {
    const { x: isoX, y: isoY } = toIsometric(mine.x, mine.y);
    drawShadow(ctx, isoX - TILE_WIDTH / 2, isoY, TILE_WIDTH, TILE_HEIGHT);
    drawBonusShape(ctx, isoX, isoY, '#8B4513');
    drawBonusSymbol(ctx, isoX, isoY, cellSize, 'M');
  });
};

export const drawTimeBombs = (
  ctx: CanvasRenderingContext2D,
  timeBombs: { position: Position; timer: number }[],
  cellSize: number,
) => {
  timeBombs.forEach((bomb) => {
    const { x: isoX, y: isoY } = toIsometric(bomb.position.x, bomb.position.y);
    drawShadow(ctx, isoX - TILE_WIDTH / 2, isoY, TILE_WIDTH, TILE_HEIGHT);
    drawBombShape(ctx, isoX, isoY);
    drawBonusSymbol(ctx, isoX, isoY, cellSize, bomb.timer.toString());
  });
};

const drawBonusShape = (ctx: CanvasRenderingContext2D, x: number, y: number, color: string) => {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y + BONUS_HEIGHT / 2);
  ctx.lineTo(x + TILE_WIDTH / 4, y);
  ctx.lineTo(x, y - BONUS_HEIGHT / 2);
  ctx.lineTo(x - TILE_WIDTH / 4, y);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.arc(x, y - BONUS_HEIGHT / 2, TILE_WIDTH / 6, 0, Math.PI * 2);
  ctx.fill();
};

const drawBombShape = (ctx: CanvasRenderingContext2D, x: number, y: number) => {
  ctx.fillStyle = '#000000';
  ctx.beginPath();
  ctx.moveTo(x, y - BONUS_HEIGHT);
  ctx.lineTo(x + TILE_WIDTH / 4, y - BONUS_HEIGHT / 2);
  ctx.lineTo(x, y + BONUS_HEIGHT / 2);
  ctx.lineTo(x - TILE_WIDTH / 4, y - BONUS_HEIGHT / 2);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = '#FFA500';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y - BONUS_HEIGHT);
  ctx.quadraticCurveTo(x + TILE_WIDTH / 8, y - BONUS_HEIGHT * 1.5, x + TILE_WIDTH / 4, y - BONUS_HEIGHT * 1.25);
  ctx.stroke();
};

const drawBonusSymbol = (ctx: CanvasRenderingContext2D, x: number, y: number, cellSize: number, symbol: string) => {
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `bold ${cellSize / 3}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(symbol, x, y - BONUS_HEIGHT / 2);
};

const getBonusColor = (bonusType: BonusType): string => {
  switch (bonusType) {
    case BonusType.CapOfInvisibility: return '#8A2BE2';
    case BonusType.ConfusedMonsters: return '#FFA500';
    case BonusType.LandMine: return '#8B4513';
    case BonusType.TimeBomb: return '#000000';
    case BonusType.Crusher: return '#FF69B4';
    case BonusType.Builder: return '#00FFFF';
    case BonusType.Climber: return '#32CD32';
    case BonusType.Teleport: return '#9400D3';
    case BonusType.Tsunami: return '#1E90FF';
    case BonusType.Monster: return '#FF4500';
    case BonusType.Slide: return '#00CED1';
    case BonusType.Sokoban: return '#DAA520';
    case BonusType.Blaster: return '#FF1493';
    default: return '#FFFF00';
  }
};

const getBonusSymbol = (bonusType: BonusType): string => {
  switch (bonusType) {
    case BonusType.CapOfInvisibility: return 'I';
    case BonusType.ConfusedMonsters: return 'C';
    case BonusType.LandMine: return 'L';
    case BonusType.TimeBomb: return 'T';
    case BonusType.Crusher: return 'X';
    case BonusType.Builder: return 'B';
    case BonusType.Climber: return '↑';
    case BonusType.Teleport: return '⊷';
    case BonusType.Tsunami: return '≋';
    case BonusType.Monster: return 'M';
    case BonusType.Slide: return '⇉';
    case BonusType.Sokoban: return '◊';
    case BonusType.Blaster: return '⚡';
    default: return '?';
  }
};