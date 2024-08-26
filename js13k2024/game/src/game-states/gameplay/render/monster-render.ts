import { Monster } from '../gameplay-types';
import { toIsometric } from './isometric-utils';
import { interpolatePosition } from './animation-utils';
import { renderEntity } from './entity-render';

export const drawMonsters = (
  ctx: CanvasRenderingContext2D,
  monsters: Monster[],
  cellSize: number,
  isPlayerMonster: boolean,
) => {
  monsters.forEach((monster) => {
    const pos = interpolatePosition(monster.position, monster.previousPosition, monster.moveTimestamp);
    const { x: isoX, y: isoY } = toIsometric(pos.x, pos.y);

    renderEntity({
      ctx,
      isoX,
      isoY,
      cellSize,
      baseHeight: 0.4,
      widthFactor: 0.6,
      heightAnimationFactor: 0.1,
      bodyColor: isPlayerMonster ? '#00FF00' : '#800080',
      headColor: isPlayerMonster ? '#32CD32' : '#9932CC',
      eyeColor: isPlayerMonster ? '#FFFFFF' : '#FFFFFF',
      pupilColor: isPlayerMonster ? '#000000' : '#FF0000',
      hasTentacles: !isPlayerMonster,
      tentacleColor: '#600060',
      tentacleCount: 6,
      tentacleLength: cellSize * 0.5,
      tentacleWidth: 4,
      seed: monster.seed,
      castShadow: true,
    });

    if (isPlayerMonster) {
      drawPlayerFeatures(ctx, isoX, isoY, cellSize);
    }
  });
};

const drawPlayerFeatures = (ctx: CanvasRenderingContext2D, x: number, y: number, cellSize: number) => {
  ctx.save();
  ctx.translate(x, y);

  const hatSize = cellSize * 0.2;
  ctx.fillStyle = '#FFD700';
  ctx.beginPath();
  ctx.moveTo(-hatSize / 2, -cellSize * 0.3);
  ctx.lineTo(0, -cellSize * 0.5);
  ctx.lineTo(hatSize / 2, -cellSize * 0.3);
  ctx.closePath();
  ctx.fill();

  for (let i = 0; i < 5; i++) {
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * cellSize * 0.4 + cellSize * 0.2;
    const sparkleX = Math.cos(angle) * distance;
    const sparkleY = Math.sin(angle) * distance;

    ctx.fillStyle = `#FFFF00${Math.floor((0.5 + Math.random() * 0.5) * 255).toString(16).padStart(2, '0')}`;
    ctx.beginPath();
    ctx.arc(sparkleX, sparkleY, cellSize * 0.05, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
};