import { UI_PAUSE_FONT_SIZE, UI_PAUSE_OVERLAY_COLOR, UI_PAUSE_TEXT_COLOR } from '../../world-consts';

export function renderPauseOverlay(ctx: CanvasRenderingContext2D): void {
  ctx.save();
  ctx.fillStyle = UI_PAUSE_OVERLAY_COLOR;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.fillStyle = UI_PAUSE_TEXT_COLOR;
  ctx.font = `${UI_PAUSE_FONT_SIZE}px "Press Start 2P", Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('PAUSED', ctx.canvas.width / 2, ctx.canvas.height / 2);
  ctx.restore();
}
