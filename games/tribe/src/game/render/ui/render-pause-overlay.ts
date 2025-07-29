export function renderPauseOverlay(ctx: CanvasRenderingContext2D): void {
  // Pause UI constants
  const UI_PAUSE_OVERLAY_COLOR = 'rgba(0, 0, 0, 0.5)';
  const UI_PAUSE_TEXT_COLOR = '#FFFFFF';
  const UI_PAUSE_FONT_SIZE = 33;

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
