import { GameWorldState } from '../../world-types';
import { UI_FONT_SIZE, UI_PADDING } from '../../ui-consts';

function calculateAverage(numbers: number[]): number {
  if (numbers.length === 0) {
    return 0;
  }
  const sum = numbers.reduce((a, b) => a + b, 0);
  return sum / numbers.length;
}

export function renderPerformanceDebugger(
  ctx: CanvasRenderingContext2D,
  gameState: GameWorldState,
  canvasWidth: number,
) {
  const { performanceMetrics } = gameState;
  if (!performanceMetrics) {
    return;
  }

  const avgFps = calculateAverage(performanceMetrics.fps);
  const avgWorldUpdateTime = calculateAverage(performanceMetrics.worldUpdateTimes);
  const avgAiUpdateTime = calculateAverage(performanceMetrics.aiUpdateTimes);
  const avgGameRenderTime = calculateAverage(performanceMetrics.gameRenderTimes);

  // Panel dimensions and position
  const panelWidth = 260;
  const panelHeight = 200;
  const panelX = canvasWidth - panelWidth - UI_PADDING;
  const panelY = UI_PADDING + UI_FONT_SIZE * 2;

  // Save context state
  ctx.save();

  // Draw panel background
  ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
  ctx.fillRect(panelX, panelY, panelWidth, panelHeight);
  ctx.strokeStyle = '#444';
  ctx.lineWidth = 2;
  ctx.strokeRect(panelX, panelY, panelWidth, panelHeight);

  // Setup text rendering
  ctx.fillStyle = 'white';
  ctx.font = '12px monospace';
  ctx.textAlign = 'left';

  let currentY = panelY + UI_PADDING + 5;
  const lineHeight = 16;
  const leftMargin = panelX + UI_PADDING;

  // Title
  ctx.fillStyle = '#66ccff';
  ctx.font = 'bold 14px monospace';
  ctx.fillText('⚙️ Performance Debugger', leftMargin, currentY);
  currentY += 25;

  // --- Display FPS ---
  ctx.fillStyle = 'white';
  ctx.font = '12px monospace';
  ctx.fillText(`FPS: ${avgFps.toFixed(1)}`, leftMargin, currentY);
  currentY += lineHeight * 1.5;

  // --- Histograms ---
  const histograms = [
    { label: 'Render', time: avgGameRenderTime, color: '#4CAF50' }, // Green
    { label: 'World Update', time: avgWorldUpdateTime, color: '#2196F3' }, // Blue
    { label: 'AI Update', time: avgAiUpdateTime, color: '#FFC107' }, // Yellow
  ];

  const maxBarWidth = panelWidth - UI_PADDING * 2;
  const barHeight = 12;
  const scale = 10; // 1ms = 10px, adjusted for better visibility

  for (const item of histograms) {
    // Draw label and time
    ctx.fillStyle = 'white';
    ctx.fillText(`${item.label}: ${item.time.toFixed(2)}ms`, leftMargin, currentY);
    currentY += lineHeight * 1.2;

    // Draw bar background
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.fillRect(leftMargin, currentY, maxBarWidth, barHeight);

    // Draw bar foreground
    const barWidth = Math.min(item.time * scale, maxBarWidth);
    ctx.fillStyle = item.color;
    ctx.fillRect(leftMargin, currentY, barWidth, barHeight);

    currentY += barHeight + UI_PADDING * 0.8;
  }

  // Footer
  ctx.fillStyle = '#888';
  ctx.font = '10px monospace';
  ctx.textAlign = 'center';
  ctx.fillText("Press '2' to toggle this panel", panelX + panelWidth / 2, panelY + panelHeight - 10);

  // Restore context state
  ctx.restore();
}
