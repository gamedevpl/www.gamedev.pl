import { RenderState } from './render-state';

import { Ground2D } from '../../../../../../tools/asset-generator/generator-assets/src/ground-2d/ground-2d';

export function drawGround(ctx: CanvasRenderingContext2D, renderState: RenderState) {
  const { viewport } = renderState;

  const leftX = Math.floor(-viewport.x / 32) * 32;
  const rightX = Math.ceil((-viewport.x + ctx.canvas.width) / 32) * 32;
  const topY = Math.floor(-viewport.y / 32) * 32;
  const bottomY = Math.ceil((-viewport.y + ctx.canvas.height) / 32) * 32;

  for (let x = leftX; x < rightX; x += 32) {
    for (let y = topY; y < bottomY; y += 32) {
      renderGroundTile(ctx, x, y);
    }
  }
}

function renderGroundTile(ctx: CanvasRenderingContext2D, x: number, y: number) {
  Ground2D.render(ctx, x, y, 32, 32, (Date.now() % 1000) / 1000, 'default', 'right');
}
