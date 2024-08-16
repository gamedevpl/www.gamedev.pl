import { Position, Bonus, BonusType } from './gameplay-types';

export const drawBonuses = (ctx: CanvasRenderingContext2D, bonuses: Bonus[], cellSize: number) => {
  bonuses.forEach((bonus) => {
    const x = bonus.position.x * cellSize;
    const y = bonus.position.y * cellSize;

    ctx.fillStyle = getBonusColor(bonus.type);
    ctx.beginPath();
    ctx.arc(x + cellSize / 2, y + cellSize / 2, cellSize / 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'white';
    ctx.font = `${cellSize / 3}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.fillText(getBonusSymbol(bonus.type), x + cellSize / 2, y + cellSize / 2);
  });
};

const getBonusColor = (bonusType: BonusType): string => {
  switch (bonusType) {
    case BonusType.CapOfInvisibility:
      return 'purple';
    case BonusType.ConfusedMonsters:
      return 'orange';
    case BonusType.LandMine:
      return 'brown';
    case BonusType.TimeBomb:
      return 'black';
    case BonusType.Crusher:
      return 'pink';
    case BonusType.Builder:
      return 'cyan';
    default:
      return 'yellow';
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
    default:
      return '?';
  }
};

export const drawLandMines = (ctx: CanvasRenderingContext2D, landMines: Position[], cellSize: number) => {
  ctx.fillStyle = 'brown';

  landMines.forEach((mine) => {
    const x = mine.x * cellSize;
    const y = mine.y * cellSize;

    ctx.beginPath();
    ctx.arc(x + cellSize / 2, y + cellSize / 2, cellSize / 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'white';
    ctx.font = `${cellSize / 3}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('LA', x + cellSize / 2, y + cellSize / 2);
  });
};

export const drawTimeBombs = (
  ctx: CanvasRenderingContext2D,
  timeBombs: { position: Position; timer: number }[],
  cellSize: number,
) => {
  ctx.fillStyle = 'black';

  timeBombs.forEach((bomb) => {
    const x = bomb.position.x * cellSize;
    const y = bomb.position.y * cellSize;

    ctx.beginPath();
    ctx.arc(x + cellSize / 2, y + cellSize / 2, cellSize / 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'white';
    ctx.font = `${cellSize / 3}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(bomb.timer.toString(), x + cellSize / 2, y + cellSize / 2);
  });
};
