import { GameWorldState, PerformanceMetricsBucket } from '../../world-types';
import { UI_FONT_SIZE, UI_PADDING } from '../../ui-consts';
import { GAME_DAY_IN_REAL_SECONDS, HOURS_PER_GAME_DAY } from '../../game-consts';

function calculateAverage(numbers: number[]): number {
  if (numbers.length === 0) {
    return 0;
  }
  const sum = numbers.reduce((a, b) => a + b, 0);
  return sum / numbers.length;
}

function renderMetricGraph(
  ctx: CanvasRenderingContext2D,
  label: string,
  data: number[],
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
) {
  ctx.save();

  // Draw background and border
  ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
  ctx.fillRect(x, y, width, height);
  ctx.strokeStyle = '#555';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, width, height);

  // Draw label
  const avg = calculateAverage(data);
  ctx.fillStyle = 'white';
  ctx.font = '11px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(`${label}: ${avg.toFixed(2)}ms`, x + UI_PADDING, y + UI_PADDING + 8);

  // Draw graph line
  const maxValue = Math.max(...data, 1); // Avoid division by zero, ensure at least 1
  const normalizedData = data.map((d) => (d / maxValue) * height);

  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;

  if (normalizedData.length > 1) {
    ctx.moveTo(x, y + height - normalizedData[0]);

    for (let i = 1; i < normalizedData.length; i++) {
      const pointX = x + (i / (normalizedData.length - 1)) * width;
      const pointY = y + height - normalizedData[i];
      ctx.lineTo(pointX, pointY);
    }
  } else if (normalizedData.length === 1) {
    // If there's only one point, draw a flat line across the graph
    const pointY = y + height - normalizedData[0];
    ctx.moveTo(x, pointY);
    ctx.lineTo(x + width, pointY);
  }
  ctx.stroke();

  // Draw max value label
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.font = '10px monospace';
  ctx.textAlign = 'right';
  ctx.fillText(`${maxValue.toFixed(2)}ms`, x + width - UI_PADDING, y + UI_PADDING + 8);

  ctx.restore();
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

  // Panel dimensions and position
  const panelWidth = 280;
  const panelHeight = 240;
  const panelX = canvasWidth - panelWidth - UI_PADDING;
  const panelY = UI_PADDING + UI_FONT_SIZE * 2;

  // Save context state
  ctx.save();

  // Draw panel background
  ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
  ctx.fillRect(panelX, panelY, panelWidth, panelHeight);
  ctx.strokeStyle = '#444';
  ctx.lineWidth = 2;
  ctx.strokeRect(panelX, panelY, panelWidth, panelHeight);

  // Setup text rendering
  ctx.fillStyle = 'white';
  ctx.font = '12px monospace';
  ctx.textAlign = 'left';

  let currentY = panelY + UI_PADDING + 5;
  const leftMargin = panelX + UI_PADDING;

  // Title
  ctx.fillStyle = '#66ccff';
  ctx.font = 'bold 14px monospace';
  ctx.fillText('⚙️ Performance Debugger', leftMargin, currentY);
  currentY += 25;

  // --- Display FPS ---
  ctx.fillStyle = 'white';
  ctx.font = '12px monospace';
  const avgFps = calculateFps(gameState);
  ctx.fillText(`FPS: ${avgFps.toFixed(1)}`, leftMargin, currentY);
  currentY += 20;

  // --- Graphs ---
  const graphWidth = panelWidth - UI_PADDING * 2;
  const graphHeight = 45;
  const graphSpacing = 10;

  renderMetricGraph(
    ctx,
    'Render',
    getMetric(gameState, 'renderTime'),
    leftMargin,
    currentY,
    graphWidth,
    graphHeight,
    '#4CAF50', // Green
  );
  currentY += graphHeight + graphSpacing;

  renderMetricGraph(
    ctx,
    'World Update',
    getMetric(gameState, 'worldUpdateTime'),
    leftMargin,
    currentY,
    graphWidth,
    graphHeight,
    '#2196F3', // Blue
  );
  currentY += graphHeight + graphSpacing;

  renderMetricGraph(
    ctx,
    'AI Update',
    getMetric(gameState, 'aiUpdateTime'),
    leftMargin,
    currentY,
    graphWidth,
    graphHeight,
    '#FFC107', // Yellow
  );

  // Footer
  ctx.fillStyle = '#888';
  ctx.font = '10px monospace';
  ctx.textAlign = 'center';
  ctx.fillText("Press '2' to toggle this panel", panelX + panelWidth / 2, panelY + panelHeight - 10);

  // Restore context state
  ctx.restore();
}

function calculateFps(gameState: GameWorldState): number {
  const { performanceMetrics } = gameState;
  if (!performanceMetrics || performanceMetrics.history.length === 0) {
    return 0;
  }
  const lastBucketTime =
    performanceMetrics.history[performanceMetrics.history.length - 1].bucketTime /
    (HOURS_PER_GAME_DAY / GAME_DAY_IN_REAL_SECONDS);
  const frames = performanceMetrics.history.filter(
    (bucket) => lastBucketTime - bucket.bucketTime / (HOURS_PER_GAME_DAY / GAME_DAY_IN_REAL_SECONDS) < 1,
  );
  const frameCount = frames.length;
  return frameCount;
}

/**
 * Groups performance metrics from the frame history into per-second buckets.
 * This is used to display a smoother, more readable graph than per-frame data.
 * @param history - The performance metrics history buffer.
 * @param key - The specific metric to extract (e.g., 'renderTime').
 * @returns An array of numbers, where each number is the sum of the metric for one second.
 */
function bucketMetricsBySecond(
  history: (PerformanceMetricsBucket & { bucketTime: number })[],
  key: keyof PerformanceMetricsBucket,
): number[] {
  if (history.length === 0) {
    return [];
  }

  const summedMetrics: Map<number, number> = new Map();

  // Sum metrics for each second
  for (const bucket of history) {
    const second = Math.floor(bucket.bucketTime / (HOURS_PER_GAME_DAY / GAME_DAY_IN_REAL_SECONDS));
    summedMetrics.set(second, (summedMetrics.get(second) || 0) + bucket[key]);
  }

  // Create the final array of metric values, sorted chronologically
  const sortedSeconds = Array.from(summedMetrics.keys()).sort();
  const result = sortedSeconds.map((second) => summedMetrics.get(second)!);

  // ignore last bucket if it's not a full second
  // als ignore first bucket if it's not a full second
  return result.slice(0, -1).slice(1).reverse();
}

function getMetric(gameState: GameWorldState, key: keyof PerformanceMetricsBucket): number[] {
  // Returns an array of metric values summed up per second for graph display.
  return bucketMetricsBySecond(gameState.performanceMetrics.history, key);
}
