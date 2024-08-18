import { Player } from './gameplay-types';
import { toIsometric } from './isometric-utils';
import { interpolatePosition } from './animation-utils';
import { renderEntity } from './entity-render';
import { EntityRenderParams } from './entity-render-utils';

export const drawPlayer = (
  ctx: CanvasRenderingContext2D,
  { position, previousPosition, moveTimestamp }: Player,
  cellSize: number,
  isInvisible: boolean = false,
) => {
  const interpolatedPosition = interpolatePosition(position, previousPosition, moveTimestamp);
  const { x: isoX, y: isoY } = toIsometric(interpolatedPosition.x, interpolatedPosition.y);

  const playerRenderParams: EntityRenderParams = {
    ctx,
    isoX,
    isoY,
    cellSize,
    baseHeight: 0.8,
    widthFactor: 0.6,
    heightAnimationFactor: 0.2,
    bodyColor: '#00FF00', // Bright green
    headColor: '#32CD32', // Lime green
    eyeColor: 'white',
    pupilColor: 'black',
    isInvisible,
  };

  renderEntity(playerRenderParams);
};
