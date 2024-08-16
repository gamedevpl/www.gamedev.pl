import { Monster } from './gameplay-types';

export const drawMonsters = (ctx: CanvasRenderingContext2D, monsters: Monster[], cellSize: number) => {
  ctx.fillStyle = 'red';

  monsters.forEach((monster) => {
    const x = monster.position.x * cellSize;
    const y = monster.position.y * cellSize;

    ctx.beginPath();
    ctx.moveTo(x + cellSize / 2, y);
    ctx.lineTo(x + cellSize, y + cellSize);
    ctx.lineTo(x, y + cellSize);
    ctx.closePath();
    ctx.fill();
  });
};