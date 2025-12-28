import { GameWorldState } from '../../world-types';
import { calculatePopulationBreakdown, calculateFoodMetrics, findTopFamilies } from '../../utils/tribe-debugger-utils';
import { UI_FONT_SIZE, UI_PADDING } from '../../ui/ui-consts';
import { canSplitTribe } from '../../utils';
import { getTribeLeaderForCoordination } from '../../entities/tribe/tribe-task-utils';
import { IndexedWorldState } from '../../world-index/world-index-types';

interface PopulationHistory {
  time: number;
  total: number;
  children: number;
  males: number;
  females: number;
  old: number;
}

interface FoodHistory {
  time: number;
  bushFood: number;
  storageFood: number;
  totalFood: number;
}

// Global history storage (persists across renders)
let populationHistory: PopulationHistory[] = [];
let foodHistory: FoodHistory[] = [];
let lastRecordTime = 0;

const HISTORY_INTERVAL = 36;
const MAX_HISTORY_LENGTH = 200;

/**
 * Renders the tribe debugger panel with population, food, and family statistics
 */
export function renderTribeDebugger(
  ctx: CanvasRenderingContext2D,
  gameState: GameWorldState,
  canvasWidth: number,
  canvasHeight: number,
): void {
  if (!gameState.debugCharacterId) {
    return;
  }

  const debugCharacter = (gameState as IndexedWorldState).search.human.byProperty('id', gameState.debugCharacterId)[0];
  if (!debugCharacter) {
    return;
  }
  let leaderId = getTribeLeaderForCoordination(debugCharacter, gameState)?.id;
  if (!leaderId) {
    return;
  }
  // Calculate current metrics
  const populationBreakdown = calculatePopulationBreakdown(leaderId, gameState);
  const foodMetrics = calculateFoodMetrics(leaderId, gameState);

  // Record history data at intervals
  if (gameState.time - lastRecordTime >= HISTORY_INTERVAL) {
    populationHistory.push({
      time: gameState.time,
      total: populationBreakdown.total,
      children: populationBreakdown.children,
      males: populationBreakdown.males,
      females: populationBreakdown.females,
      old: populationBreakdown.old,
    });

    const totalFood = foodMetrics.totalBushFood + foodMetrics.totalStorageFood;
    foodHistory.push({
      time: gameState.time,
      bushFood: foodMetrics.totalBushFood,
      storageFood: foodMetrics.totalStorageFood,
      totalFood,
    });

    // Keep history at reasonable size
    if (populationHistory.length > MAX_HISTORY_LENGTH) {
      populationHistory = populationHistory.slice(-MAX_HISTORY_LENGTH);
    }
    if (foodHistory.length > MAX_HISTORY_LENGTH) {
      foodHistory = foodHistory.slice(-MAX_HISTORY_LENGTH);
    }

    lastRecordTime = gameState.time;
  }

  // Calculate food consumption rate from history
  let consumptionRate = 0;
  if (foodHistory.length >= 2) {
    const current = foodHistory[foodHistory.length - 1];
    const previous = foodHistory[foodHistory.length - 2];
    const timeDelta = current.time - previous.time;
    if (timeDelta > 0) {
      consumptionRate = (previous.totalFood - current.totalFood) / timeDelta;
    }
  }

  // Setup debugger panel
  const panelWidth = 400;
  const panelHeight = Math.min(canvasHeight * 0.9, 700);
  const panelX = canvasWidth - panelWidth - 10;
  const panelY = UI_PADDING + UI_FONT_SIZE * 2;

  // Save context state
  ctx.save();

  // Draw panel background
  ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
  ctx.fillRect(panelX, panelY, panelWidth, panelHeight);

  // Draw panel border
  ctx.strokeStyle = '#444';
  ctx.lineWidth = 2;
  ctx.strokeRect(panelX, panelY, panelWidth, panelHeight);

  // Setup text rendering
  ctx.fillStyle = 'white';
  ctx.font = '12px monospace';
  ctx.textAlign = 'left';

  let currentY = panelY + 20;
  const lineHeight = 13;
  const leftMargin = panelX + 15;

  // Title
  ctx.fillStyle = '#66ccff';
  ctx.font = 'bold 14px monospace';
  ctx.fillText('👥 Tribe Debugger', leftMargin, currentY);
  currentY += 25;

  // Population Chart
  ctx.fillStyle = '#66ccff';
  ctx.font = 'bold 13px monospace';
  ctx.fillText('📊 Population Over Time', leftMargin, currentY);
  currentY += 18;

  // Population stats
  ctx.fillStyle = 'white';
  ctx.font = '11px monospace';
  ctx.fillText(`Total: ${populationBreakdown.total}`, leftMargin, currentY);
  currentY += lineHeight;
  ctx.fillStyle = '#00ffff';
  ctx.fillText(`Children: ${populationBreakdown.children}`, leftMargin, currentY);
  currentY += lineHeight;
  ctx.fillStyle = '#4488ff';
  ctx.fillText(`Males: ${populationBreakdown.males}`, leftMargin, currentY);
  currentY += lineHeight;
  ctx.fillStyle = '#ff88ff';
  ctx.fillText(`Females: ${populationBreakdown.females}`, leftMargin, currentY);
  currentY += lineHeight;
  ctx.fillStyle = '#888888';
  ctx.fillText(`Old (${populationBreakdown.old})`, leftMargin, currentY);
  currentY += 20;

  // Render population chart
  const recentPopulation = populationHistory.slice(-50);
  if (recentPopulation.length > 1) {
    renderPopulationChart(ctx, leftMargin, currentY, recentPopulation);
    currentY += 100;
  }

  // Food Chart
  ctx.fillStyle = '#66ccff';
  ctx.font = 'bold 13px monospace';
  ctx.fillText('🍎 Food Metrics', leftMargin, currentY);
  currentY += 18;

  // Food stats
  const totalFood = foodMetrics.totalBushFood + foodMetrics.totalStorageFood;
  ctx.fillStyle = '#ffff00';
  ctx.font = '11px monospace';
  ctx.fillText(`Total Food: ${totalFood}`, leftMargin, currentY);
  currentY += lineHeight;
  ctx.fillStyle = '#44ff44';
  ctx.fillText(`Bush Food: ${foodMetrics.totalBushFood}`, leftMargin, currentY);
  currentY += lineHeight;
  ctx.fillStyle = '#ffaa44';
  ctx.fillText(`Storage Food: ${foodMetrics.totalStorageFood}`, leftMargin, currentY);
  currentY += lineHeight;
  ctx.fillStyle = '#ff4444';
  ctx.fillText(`Consumption: ${consumptionRate.toFixed(2)}/hour`, leftMargin, currentY);
  currentY += 20;

  // Render food chart
  const recentFood = foodHistory.slice(-50);
  if (recentFood.length > 1) {
    renderFoodChart(ctx, leftMargin, currentY, recentFood);
    currentY += 100;
  }

  // Top 5 Families
  ctx.fillStyle = '#66ccff';
  ctx.font = 'bold 13px monospace';
  ctx.fillText('👨‍👩‍👧‍👦 Top 5 Families', leftMargin, currentY);
  currentY += 18;

  const topFamilies = findTopFamilies(leaderId, gameState, 5);
  ctx.fillStyle = 'white';
  ctx.font = '11px monospace';

  if (topFamilies.length === 0) {
    ctx.fillText('No families found', leftMargin, currentY);
    currentY += lineHeight;
  } else {
    topFamilies.forEach((family, index) => {
      const rank = index + 1;
      const text = `${rank}. ${family.patriarch.isPlayer ? 'Player' : '#' + family.patriarch.id} (${
        family.memberCount
      } members, can split: ${canSplitTribe(family.patriarch, gameState).canSplit})`;
      ctx.fillText(text, leftMargin, currentY);
      currentY += lineHeight;
    });
  }

  currentY += 10;

  // Footer
  ctx.fillStyle = '#888';
  ctx.font = '10px monospace';
  ctx.textAlign = 'center';
  ctx.fillText("Press 'Shift+3' to toggle this debugger", panelX + panelWidth / 2, panelY + panelHeight - 10);

  // Restore context state
  ctx.restore();
}

/**
 * Renders the population chart with multiple data series
 */
function renderPopulationChart(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  history: PopulationHistory[],
): void {
  const chartWidth = 350;
  const chartHeight = 80;

  if (history.length < 2) return;

  // Find max value for scaling
  const maxValue = Math.max(
    ...history.map((h) => Math.max(h.total, h.children, h.males, h.females, h.old)),
    10, // Minimum scale
  );

  // Chart border
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, chartWidth, chartHeight);

  // Define series
  const series = [
    { data: history.map((h) => h.total), color: '#ffffff', label: 'Total' },
    { data: history.map((h) => h.children), color: '#00ffff', label: 'Children' },
    { data: history.map((h) => h.males), color: '#4488ff', label: 'Males' },
    { data: history.map((h) => h.females), color: '#ff88ff', label: 'Females' },
    { data: history.map((h) => h.old), color: '#888888', label: 'Old' },
  ];

  // Draw each series
  series.forEach((s) => {
    ctx.beginPath();
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 2;

    for (let i = 0; i < s.data.length; i++) {
      const pointX = x + (i / (s.data.length - 1)) * chartWidth;
      const pointY = y + chartHeight - (s.data[i] / maxValue) * chartHeight;

      if (i === 0) {
        ctx.moveTo(pointX, pointY);
      } else {
        ctx.lineTo(pointX, pointY);
      }
    }
    ctx.stroke();
  });
}

/**
 * Renders the food chart with multiple data series
 */
function renderFoodChart(ctx: CanvasRenderingContext2D, x: number, y: number, history: FoodHistory[]): void {
  const chartWidth = 350;
  const chartHeight = 80;

  if (history.length < 2) return;

  // Find max value for scaling
  const maxValue = Math.max(...history.map((h) => Math.max(h.totalFood, h.bushFood, h.storageFood)), 10);

  // Chart border
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, chartWidth, chartHeight);

  // Define series
  const series = [
    { data: history.map((h) => h.totalFood), color: '#ffff00', label: 'Total' },
    { data: history.map((h) => h.bushFood), color: '#44ff44', label: 'Bush' },
    { data: history.map((h) => h.storageFood), color: '#ffaa44', label: 'Storage' },
  ];

  // Draw each series
  series.forEach((s) => {
    ctx.beginPath();
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 2;

    for (let i = 0; i < s.data.length; i++) {
      const pointX = x + (i / (s.data.length - 1)) * chartWidth;
      const pointY = y + chartHeight - (s.data[i] / maxValue) * chartHeight;

      if (i === 0) {
        ctx.moveTo(pointX, pointY);
      } else {
        ctx.lineTo(pointX, pointY);
      }
    }
    ctx.stroke();
  });
}
