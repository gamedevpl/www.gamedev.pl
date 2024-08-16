import { Monster } from './gameplay-types';
import { toIsometric, TILE_WIDTH, TILE_HEIGHT } from './isometric-utils';
import { drawShadow } from './game-render';

export const drawMonsters = (ctx: CanvasRenderingContext2D, monsters: Monster[], cellSize: number) => {
  monsters.forEach((monster) => {
    const { x: isoX, y: isoY } = toIsometric(monster.position.x, monster.position.y);
    const monsterHeight = cellSize * 0.7;
    const monsterWidth = TILE_WIDTH * 0.8;

    // Draw shadow
    drawShadow(ctx, isoX - TILE_WIDTH / 2, isoY, TILE_WIDTH, TILE_HEIGHT);

    // Draw monster body
    ctx.fillStyle = '#800080'; // Purple
    ctx.beginPath();
    ctx.moveTo(isoX, isoY - monsterHeight);
    ctx.lineTo(isoX + monsterWidth / 2, isoY - monsterHeight / 2 + TILE_HEIGHT / 4);
    ctx.lineTo(isoX, isoY + TILE_HEIGHT / 2);
    ctx.lineTo(isoX - monsterWidth / 2, isoY - monsterHeight / 2 + TILE_HEIGHT / 4);
    ctx.closePath();
    ctx.fill();

    // Draw monster head
    const headRadius = cellSize * 0.25;
    ctx.fillStyle = '#9932CC'; // Dark orchid
    ctx.beginPath();
    ctx.arc(isoX, isoY - monsterHeight - headRadius / 2, headRadius, 0, Math.PI * 2);
    ctx.fill();

    // Draw eyes
    const eyeRadius = headRadius * 0.3;
    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.arc(isoX - headRadius / 3, isoY - monsterHeight - headRadius / 2, eyeRadius, 0, Math.PI * 2);
    ctx.arc(isoX + headRadius / 3, isoY - monsterHeight - headRadius / 2, eyeRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'red';
    ctx.beginPath();
    ctx.arc(isoX - headRadius / 3, isoY - monsterHeight - headRadius / 2, eyeRadius / 2, 0, Math.PI * 2);
    ctx.arc(isoX + headRadius / 3, isoY - monsterHeight - headRadius / 2, eyeRadius / 2, 0, Math.PI * 2);
    ctx.fill();

    // Draw mouth
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(isoX, isoY - monsterHeight + headRadius / 4, headRadius / 2, 0.1 * Math.PI, 0.9 * Math.PI);
    ctx.stroke();

    // Draw tentacles or spikes
    const tentacleCount = 3;
    const tentacleLength = cellSize * 0.3;
    ctx.strokeStyle = '#800080';
    ctx.lineWidth = 3;
    for (let i = 0; i < tentacleCount; i++) {
      const angle = (i / tentacleCount) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(isoX, isoY - monsterHeight / 2);
      ctx.lineTo(isoX + Math.cos(angle) * tentacleLength, isoY - monsterHeight / 2 + Math.sin(angle) * tentacleLength);
      ctx.stroke();
    }
  });
};
