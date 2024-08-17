import { Monster } from './gameplay-types';
import { toIsometric } from './isometric-utils';
import { interpolatePosition } from './animation-utils';
import { EntityRenderParams } from './entity-render-utils';
import { renderEntity } from './entity-render';

export const drawMonsters = (ctx: CanvasRenderingContext2D, monsters: Monster[], cellSize: number) => {
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
      bodyColor: '#800080', // Purple
      headColor: '#9932CC', // Dark orchid
      eyeColor: 'white',
      pupilColor: 'red',
      hasTentacles: true,
      tentacleColor: '#600060', // Purple, same as body color
      tentacleCount: 6, // Increased from 3 to 6 for more tentacles
      tentacleLength: cellSize * 0.5, // Increased from 0.6 to 0.8 for longer tentacles
      tentacleWidth: 4, // Increased from 3 to 4 for slightly thicker tentacles
      seed: monster.seed,
      castShadow: true, // Enable shadow casting for tentacles
    };

    renderEntity(monsterRenderParams);
  });
};
