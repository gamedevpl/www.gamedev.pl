import { Monster } from './gameplay-types';
import { toIsometric } from './isometric-utils';
import { interpolatePosition } from './animation-utils';
import { EntityRenderParams } from './entity-render-utils';
import { renderEntity } from './entity-render';

export const drawMonsters = (ctx: CanvasRenderingContext2D, monsters: Monster[], cellSize: number, isPlayerMonster: boolean) => {
  monsters.forEach((monster) => {
    const interpolatedPosition = interpolatePosition(monster.position, monster.previousPosition, monster.moveTimestamp);

    const { x: isoX, y: isoY } = toIsometric(interpolatedPosition.x, interpolatedPosition.y);

    const monsterRenderParams: EntityRenderParams = {
      ctx,
      isoX,
      isoY,
      cellSize,
      baseHeight: 0.4,
      widthFactor: 0.6,
      heightAnimationFactor: 0.1,
      bodyColor: isPlayerMonster ? '#00FF00' : '#800080', // Green if player is monster, else Purple
      headColor: isPlayerMonster ? '#32CD32' : '#9932CC', // Lime green if player is monster, else Dark orchid
      eyeColor: isPlayerMonster ? 'white' : 'white',
      pupilColor: isPlayerMonster ? 'black' : 'red',
      hasTentacles: !isPlayerMonster, // Only show tentacles if not transformed into player
      tentacleColor: '#600060', // Purple, same as body color
      tentacleCount: 6,
      tentacleLength: cellSize * 0.5,
      tentacleWidth: 4,
      seed: monster.seed,
      castShadow: true,
    };

    renderEntity(monsterRenderParams);

    if (isPlayerMonster) {
      drawPlayerFeatures(ctx, isoX, isoY, cellSize);
    }
  });
};

const drawPlayerFeatures = (ctx: CanvasRenderingContext2D, x: number, y: number, cellSize: number) => {
  ctx.save();
  ctx.translate(x, y);

  // Draw a small crown or hat to indicate it's a player-monster
  const hatSize = cellSize * 0.2;
  ctx.fillStyle = '#FFD700'; // Gold color
  ctx.beginPath();
  ctx.moveTo(-hatSize / 2, -cellSize * 0.3);
  ctx.lineTo(0, -cellSize * 0.5);
  ctx.lineTo(hatSize / 2, -cellSize * 0.3);
  ctx.closePath();
  ctx.fill();

  // Add some sparkles around the player-monster
  for (let i = 0; i < 5; i++) {
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * cellSize * 0.4 + cellSize * 0.2;
    const sparkleX = Math.cos(angle) * distance;
    const sparkleY = Math.sin(angle) * distance;

    ctx.fillStyle = `rgba(255, 255, 0, ${0.5 + Math.random() * 0.5})`;
    ctx.beginPath();
    ctx.arc(sparkleX, sparkleY, cellSize * 0.05, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
};