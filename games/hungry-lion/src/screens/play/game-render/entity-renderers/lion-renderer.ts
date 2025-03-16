import { LionEntity } from '../../game-world/entities/entities-types';
import { LION_WIDTH } from '../../game-world/game-world-consts';
import { vectorLength } from '../../game-world/utils/math-utils';

import {Lion2d} from '../../../../../../../tools/asset-generator/generator-assets/src/lion-2d/lion-2d'

export function drawLion(ctx: CanvasRenderingContext2D, lion: LionEntity) {
  const width = LION_WIDTH;
  const height = LION_WIDTH;

  const position = lion.position;
  const isMoving = vectorLength(lion.velocity) > 0;

  let stance;
  if (isMoving) {
    stance = 'walking';
  } else{
    stance = 'standing';
  }    

  Lion2d.render(ctx, position.x, position.y, width, height, Date.now() % 1000 / 1000, stance, lion.velocity.x < 0 ? 'left' : 'right');

  // ctx.save();
  // ctx.translate(position.x, position.y);
  // ctx.rotate(lion.direction);

  // // Draw the lion's body (triangle)
  // ctx.beginPath();
  // ctx.moveTo(width / 2, 0);
  // ctx.lineTo(-width / 2, -height / 2);
  // ctx.lineTo(-width / 2, height / 2);
  // ctx.closePath();

  // const hungerPercentage = lion.hungerLevel / 100;
  // const intensity = isMoving ? '255' : '200';
  // ctx.fillStyle = `rgba(${intensity}, ${intensity}, 0, ${hungerPercentage})`;
  // ctx.fill();

  // // Add border
  // ctx.strokeStyle = 'black';
  // ctx.lineWidth = 2;
  // ctx.stroke();

  // ctx.restore();
}
