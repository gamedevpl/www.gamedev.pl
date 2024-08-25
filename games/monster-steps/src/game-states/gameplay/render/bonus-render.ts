import { Position, Bonus, BonusType } from '../gameplay-types';
import { toIsometric, TILE_WIDTH, TILE_HEIGHT } from './isometric-utils';
import { drawShadow } from './grid-render';

const BONUS_HEIGHT = TILE_HEIGHT;

export const drawBonuses = (ctx: CanvasRenderingContext2D, bonuses: Bonus[], cellSize: number) => {
  bonuses.forEach((bonus) => {
    const { x: isoX, y: isoY } = toIsometric(bonus.position.x, bonus.position.y);

    // Draw shadow
    drawShadow(ctx, isoX - TILE_WIDTH / 4, isoY - TILE_HEIGHT / 4, TILE_WIDTH / 2, TILE_HEIGHT);

    // Draw bonus base
    ctx.fillStyle = getBonusColor(bonus.type);
    ctx.beginPath();
    ctx.moveTo(isoX, isoY + BONUS_HEIGHT / 2);
    ctx.lineTo(isoX + TILE_WIDTH / 4, isoY);
    ctx.lineTo(isoX, isoY - BONUS_HEIGHT / 2);
    ctx.lineTo(isoX - TILE_WIDTH / 4, isoY);
    ctx.closePath();
    ctx.fill();

    // Draw bonus top
    ctx.beginPath();
    ctx.arc(isoX, isoY - BONUS_HEIGHT / 2, TILE_WIDTH / 6, 0, Math.PI * 2);
    ctx.fill();

    // Draw bonus symbol
    ctx.fillStyle = 'white';
    ctx.font = `bold ${cellSize / 3}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(getBonusSymbol(bonus.type), isoX, isoY - BONUS_HEIGHT / 2);
  });
};

export const drawLandMines = (ctx: CanvasRenderingContext2D, landMines: Position[], cellSize: number) => {
  landMines.forEach((mine) => {
    const { x: isoX, y: isoY } = toIsometric(mine.x, mine.y);

    // Draw shadow
    drawShadow(ctx, isoX - TILE_WIDTH / 2, isoY, TILE_WIDTH, TILE_HEIGHT);

    // Draw mine base
    ctx.fillStyle = 'brown';
    ctx.beginPath();
    ctx.moveTo(isoX, isoY + BONUS_HEIGHT / 2);
    ctx.lineTo(isoX + TILE_WIDTH / 4, isoY);
    ctx.lineTo(isoX, isoY - BONUS_HEIGHT / 2);
    ctx.lineTo(isoX - TILE_WIDTH / 4, isoY);
    ctx.closePath();
    ctx.fill();

    // Draw mine top
    ctx.beginPath();
    ctx.arc(isoX, isoY - BONUS_HEIGHT / 2, TILE_WIDTH / 5, 0, Math.PI * 2);
    ctx.fill();

    // Draw mine symbol
    ctx.fillStyle = 'white';
    ctx.font = `bold ${cellSize / 3}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('M', isoX, isoY - BONUS_HEIGHT / 2);
  });
};

export const drawTimeBombs = (
  ctx: CanvasRenderingContext2D,
  timeBombs: { position: Position; timer: number }[],
  cellSize: number,
) => {
  timeBombs.forEach((bomb) => {
    const { x: isoX, y: isoY } = toIsometric(bomb.position.x, bomb.position.y);

    // Draw shadow
    drawShadow(ctx, isoX - TILE_WIDTH / 2, isoY, TILE_WIDTH, TILE_HEIGHT);

    // Draw bomb body
    ctx.fillStyle = 'black';
    ctx.beginPath();
    ctx.moveTo(isoX, isoY - BONUS_HEIGHT);
    ctx.lineTo(isoX + TILE_WIDTH / 4, isoY - BONUS_HEIGHT / 2);
    ctx.lineTo(isoX, isoY + BONUS_HEIGHT / 2);
    ctx.lineTo(isoX - TILE_WIDTH / 4, isoY - BONUS_HEIGHT / 2);
    ctx.closePath();
    ctx.fill();

    // Draw bomb fuse
    ctx.strokeStyle = 'orange';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(isoX, isoY - BONUS_HEIGHT);
    ctx.quadraticCurveTo(
      isoX + TILE_WIDTH / 8,
      isoY - BONUS_HEIGHT * 1.5,
      isoX + TILE_WIDTH / 4,
      isoY - BONUS_HEIGHT * 1.25,
    );
    ctx.stroke();

    // Draw timer
    ctx.fillStyle = 'white';
    ctx.font = `bold ${cellSize / 3}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(bomb.timer.toString(), isoX, isoY - BONUS_HEIGHT / 2);
  });
};

const getBonusColor = (bonusType: BonusType): string => {
  switch (bonusType) {
    case BonusType.CapOfInvisibility:
      return '#8A2BE2'; // Blue Violet
    case BonusType.ConfusedMonsters:
      return '#FFA500'; // Orange
    case BonusType.LandMine:
      return '#8B4513'; // Saddle Brown
    case BonusType.TimeBomb:
      return '#000000'; // Black
    case BonusType.Crusher:
      return '#FF69B4'; // Hot Pink
    case BonusType.Builder:
      return '#00FFFF'; // Cyan
    case BonusType.Climber:
      return '#32CD32'; // Lime Green
    case BonusType.Teleport:
      return '#9400D3'; // Dark Violet
    case BonusType.Tsunami:
      return '#1E90FF'; // Dodger Blue
    case BonusType.Monster:
      return '#FF4500'; // Orange Red
    case BonusType.Slide:
      return '#00CED1'; // Dark Turquoise
    case BonusType.Sokoban:
      return '#DAA520'; // Goldenrod
    case BonusType.Blaster:
      return '#FF1493'; // Deep Pink
    default:
      return '#FFFF00'; // Yellow
  }
};

const getBonusSymbol = (bonusType: BonusType): string => {
  switch (bonusType) {
    case BonusType.CapOfInvisibility:
      return 'I';
    case BonusType.ConfusedMonsters:
      return 'C';
    case BonusType.LandMine:
      return 'L';
    case BonusType.TimeBomb:
      return 'T';
    case BonusType.Crusher:
      return 'X';
    case BonusType.Builder:
      return 'B';
    case BonusType.Climber:
      return '↑';
    case BonusType.Teleport:
      return '⊷';
    case BonusType.Tsunami:
      return '≋';
    case BonusType.Monster:
      return 'M';
    case BonusType.Slide:
      return '⇉';
    case BonusType.Sokoban:
      return '◊';
    case BonusType.Blaster:
      return '⚡';
    default:
      return '?';
  }
};
