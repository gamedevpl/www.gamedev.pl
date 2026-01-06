import { GameWorldState } from '../../world-types';
import { getEcosystemBalancerStats } from '../../ecosystem/ecosystem-balancer';
import {
  ECOSYSTEM_BALANCER_TARGET_BUSH_COUNT,
  ECOSYSTEM_BALANCER_TARGET_PREDATOR_POPULATION,
  ECOSYSTEM_BALANCER_TARGET_PREY_POPULATION,
  ECOSYSTEM_BALANCER_TARGET_TREE_COUNT,
  MAP_WIDTH,
  MAP_HEIGHT,
} from '../../game-consts.ts';
import { IndexedWorldState } from '../../world-index/world-index-types';
import { UI_FONT_SIZE, UI_PADDING } from '../../ui/ui-consts.ts';

interface PopulationHistory {
  time: number;
  prey: number;
  predators: number;
  bushes: number;
  trees: number;
}

// Global history storage (persists across renders)
let populationHistory: PopulationHistory[] = [];
let lastRecordTime = 0;

const HISTORY_INTERVAL = 36;
const MAX_HISTORY_LENGTH = 200; // Keep last 200 data points

/**
 * Renders the ecosystem debugger directly to canvas
 */
export function renderEcosystemDebugger(
  ctx: CanvasRenderingContext2D,
  gameState: GameWorldState,
  canvasWidth: number,
  canvasHeight: number,
): void {
  const preyCount = (gameState as IndexedWorldState).search.prey.count();
  const predatorCount = (gameState as IndexedWorldState).search.predator.count();
  const bushCount = (gameState as IndexedWorldState).search.berryBush.count();
  const treeCount = (gameState as IndexedWorldState).search.tree.count();

  // Record population data
  if (gameState.time - lastRecordTime >= HISTORY_INTERVAL) {
    populationHistory.push({
      time: gameState.time,
      prey: preyCount,
      predators: predatorCount,
      bushes: bushCount,
      trees: treeCount,
    });

    // Keep history at reasonable size
    if (populationHistory.length > MAX_HISTORY_LENGTH) {
      populationHistory = populationHistory.slice(-MAX_HISTORY_LENGTH);
    }

    lastRecordTime = gameState.time;
  }

  const mapArea = MAP_WIDTH * MAP_HEIGHT;
  const preyDensityPer1000 = (preyCount / mapArea) * 1000000; // per 1000 pixels²
  const predatorDensityPer1000 = (predatorCount / mapArea) * 1000000;
  const bushDensityPer1000 = (bushCount / mapArea) * 1000000;
  const treeDensityPer1000 = (treeCount / mapArea) * 1000000;

  const qlStats = getEcosystemBalancerStats();

  // Game time calculations
  const gameYear = Math.floor(gameState.time / (24 * 365));
  const gameDay = Math.floor((gameState.time % (24 * 365)) / 24);
  const gameHour = Math.floor(gameState.time % 24);

  // Setup debugger panel
  const panelWidth = 400;
  const panelHeight = Math.min(canvasHeight * 0.8, 600);
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
  const lineHeight = 14;
  const leftMargin = panelX + 15;

  // Title
  ctx.fillStyle = '#66ccff';
  ctx.font = 'bold 14px monospace';
  ctx.fillText('🔧 Ecosystem Debugger', leftMargin, currentY);
  currentY += 25;

  // Basic info
  ctx.fillStyle = 'white';
  ctx.font = '12px monospace';
  ctx.fillText(`Game Time: Year ${gameYear}, Day ${gameDay}, Hour ${gameHour}`, leftMargin, currentY);
  currentY += lineHeight;
  ctx.fillText(`Map Size: ${MAP_WIDTH} × ${MAP_HEIGHT} pixels`, leftMargin, currentY);
  currentY += 20;

  // Q-Learning Status
  ctx.fillStyle = '#66ccff';
  ctx.font = 'bold 13px monospace';
  ctx.fillText('🧠 Q-Learning Status', leftMargin, currentY);
  currentY += 18;

  if (qlStats) {
    ctx.fillText(`Q-Table Size: ${qlStats.qTableSize} entries`, leftMargin, currentY);
    currentY += lineHeight;
    ctx.fillText(`Exploration Rate: ${(qlStats.explorationRate * 100).toFixed(1)}%`, leftMargin, currentY);
    currentY += lineHeight;
  }

  // Population History Mini-Chart
  const recentHistory = populationHistory.slice(-20);
  if (recentHistory.length > 1) {
    ctx.fillStyle = '#66ccff';
    ctx.font = 'bold 13px monospace';
    ctx.fillText('📈 Population Trends (Last 20 Points)', leftMargin, currentY);
    currentY += 30;

    renderPopulationTrends(ctx, leftMargin, currentY, recentHistory);
    currentY += 50;
  }

  // Population Density
  ctx.fillStyle = '#66ccff';
  ctx.font = 'bold 13px monospace';
  ctx.fillText('📏 Density (per 1000 px²)', leftMargin, currentY);
  currentY += 18;

  ctx.fillStyle = 'white';
  ctx.font = '12px monospace';
  const preyTargetDensity = ((ECOSYSTEM_BALANCER_TARGET_PREY_POPULATION / mapArea) * 1000000).toFixed(2);
  const predatorTargetDensity = ((ECOSYSTEM_BALANCER_TARGET_PREDATOR_POPULATION / mapArea) * 1000000).toFixed(2);
  const bushTargetDensity = ((ECOSYSTEM_BALANCER_TARGET_BUSH_COUNT / mapArea) * 1000000).toFixed(2);
  const treeTargetDensity = ((ECOSYSTEM_BALANCER_TARGET_TREE_COUNT / mapArea) * 1000000).toFixed(2);

  ctx.fillText(`Prey: ${preyDensityPer1000.toFixed(2)} (target: ${preyTargetDensity})`, leftMargin, currentY);
  currentY += lineHeight;
  ctx.fillText(
    `Predators: ${predatorDensityPer1000.toFixed(2)} (target: ${predatorTargetDensity})`,
    leftMargin,
    currentY,
  );
  currentY += lineHeight;
  ctx.fillText(`Bushes: ${bushDensityPer1000.toFixed(2)} (target: ${bushTargetDensity})`, leftMargin, currentY);
  currentY += lineHeight;
  ctx.fillText(`Trees: ${treeDensityPer1000.toFixed(2)} (target: ${treeTargetDensity})`, leftMargin, currentY);
  currentY += 20;

  // Current Population Summary
  ctx.fillStyle = '#66ccff';
  ctx.font = 'bold 13px monospace';
  ctx.fillText('📊 Current Population Status', leftMargin, currentY);
  currentY += 18;

  ctx.fillStyle = 'white';
  ctx.font = '12px monospace';

  const preyPercentage = Math.round((preyCount / ECOSYSTEM_BALANCER_TARGET_PREY_POPULATION) * 100);
  const predatorPercentage = Math.round((predatorCount / ECOSYSTEM_BALANCER_TARGET_PREDATOR_POPULATION) * 100);
  const bushPercentage = Math.round((bushCount / ECOSYSTEM_BALANCER_TARGET_BUSH_COUNT) * 100);
  const treePercentage = Math.round((treeCount / ECOSYSTEM_BALANCER_TARGET_TREE_COUNT) * 100);

  const getStatusColor = (percentage: number) => {
    if (percentage < 50) return '#ff4444';
    if (percentage < 80) return '#ffaa44';
    if (percentage > 120) return '#44aaff';
    return '#44ff44';
  };

  ctx.fillStyle = getStatusColor(preyPercentage);
  ctx.fillText(
    `Prey: ${preyCount}/${ECOSYSTEM_BALANCER_TARGET_PREY_POPULATION} (${preyPercentage}%)`,
    leftMargin,
    currentY,
  );
  currentY += lineHeight;

  ctx.fillStyle = getStatusColor(predatorPercentage);
  ctx.fillText(
    `Predators: ${predatorCount}/${ECOSYSTEM_BALANCER_TARGET_PREDATOR_POPULATION} (${predatorPercentage}%)`,
    leftMargin,
    currentY,
  );
  currentY += lineHeight;

  ctx.fillStyle = getStatusColor(treePercentage);
  ctx.fillText(
    `Trees: ${treeCount}/${ECOSYSTEM_BALANCER_TARGET_TREE_COUNT} (${treePercentage}%)`,
    leftMargin,
    currentY,
  );
  currentY += lineHeight;

  ctx.fillStyle = getStatusColor(bushPercentage);
  ctx.fillText(
    `Bushes: ${bushCount}/${ECOSYSTEM_BALANCER_TARGET_BUSH_COUNT} (${bushPercentage}%)`,
    leftMargin,
    currentY,
  );
  currentY += 20;

  // Current Parameters
  ctx.fillStyle = '#66ccff';
  ctx.font = 'bold 13px monospace';
  ctx.fillText('⚙️ Current Parameters', leftMargin, currentY);
  currentY += 18;

  ctx.fillStyle = 'white';
  ctx.font = '10px monospace';

  ctx.fillText('Prey:', leftMargin, currentY);
  currentY += 13;
  ctx.fillText(`• Gestation: ${gameState.ecosystem.preyGestationPeriod.toFixed(1)}h`, leftMargin, currentY);
  currentY += 11;
  ctx.fillText(`• Procreation: ${gameState.ecosystem.preyProcreationCooldown.toFixed(1)}h`, leftMargin, currentY);
  currentY += 11;
  ctx.fillText(`• Hunger: ${gameState.ecosystem.preyHungerIncreasePerHour.toFixed(1)}/h`, leftMargin, currentY);
  currentY += 13;

  ctx.fillText('Predators:', leftMargin, currentY);
  currentY += 13;
  ctx.fillText(`• Gestation: ${gameState.ecosystem.predatorGestationPeriod.toFixed(1)}h`, leftMargin, currentY);
  currentY += 11;
  ctx.fillText(`• Procreation: ${gameState.ecosystem.predatorProcreationCooldown.toFixed(1)}h`, leftMargin, currentY);
  currentY += 11;
  ctx.fillText(`• Hunger: ${gameState.ecosystem.predatorHungerIncreasePerHour.toFixed(1)}/h`, leftMargin, currentY);
  currentY += 13;

  ctx.fillText('Bushes:', leftMargin, currentY);
  currentY += 13;
  ctx.fillText(
    `• Spread Chance: ${(gameState.ecosystem.berryBushSpreadChance * 100).toFixed(1)}%`,
    leftMargin,
    currentY,
  );
  currentY += 15;

  ctx.fillText('Trees:', leftMargin, currentY);
  currentY += 13;
  ctx.fillText(`• Spread Chance: ${(gameState.ecosystem.treeSpreadChance * 100).toFixed(1)}%`, leftMargin, currentY);
  currentY += 15;

  // Footer
  ctx.fillStyle = '#888';
  ctx.font = '10px monospace';
  ctx.textAlign = 'center';
  ctx.fillText("Press '1' to toggle this debugger", panelX + panelWidth / 2, panelY + panelHeight - 10);

  // Restore context state
  ctx.restore();
}

/**
 * Renders population trend mini-charts
 */
function renderPopulationTrends(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  recentHistory: PopulationHistory[],
): void {
  const chartWidth = 100;
  const chartHeight = 30;
  const chartSpacing = 15;

  if (recentHistory.length < 2) return;

  const maxValues = {
    prey: Math.max(...recentHistory.map((h) => h.prey), ECOSYSTEM_BALANCER_TARGET_PREY_POPULATION),
    predators: Math.max(...recentHistory.map((h) => h.predators), ECOSYSTEM_BALANCER_TARGET_PREDATOR_POPULATION),
    bushes: Math.max(...recentHistory.map((h) => h.bushes), ECOSYSTEM_BALANCER_TARGET_BUSH_COUNT),
    trees: Math.max(...recentHistory.map((h) => h.trees), ECOSYSTEM_BALANCER_TARGET_TREE_COUNT),
  };

  const charts = [
    {
      data: recentHistory.map((h) => h.prey),
      color: '#44ff44',
      label: 'Prey',
      target: ECOSYSTEM_BALANCER_TARGET_PREY_POPULATION,
      max: maxValues.prey,
    },
    {
      data: recentHistory.map((h) => h.predators),
      color: '#ff4444',
      label: 'Predators',
      target: ECOSYSTEM_BALANCER_TARGET_PREDATOR_POPULATION,
      max: maxValues.predators,
    },
    {
      data: recentHistory.map((h) => h.trees),
      color: '#76a331',
      label: 'Trees',
      target: ECOSYSTEM_BALANCER_TARGET_TREE_COUNT,
      max: maxValues.trees,
    },
    {
      data: recentHistory.map((h) => h.bushes),
      color: '#ffaa44',
      label: 'Bushes',
      target: ECOSYSTEM_BALANCER_TARGET_BUSH_COUNT,
      max: maxValues.bushes,
    },
  ];

  charts.forEach((chart, i) => {
    const chartX = x + (i % 2) * (chartWidth + chartSpacing);
    const chartY = y + Math.floor(i / 2) * (chartHeight + 25);

    // Chart label
    ctx.fillStyle = chart.color;
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(chart.label, chartX, chartY - 5);

    // Chart border
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.strokeRect(chartX, chartY, chartWidth, chartHeight);

    // Draw trend line
    ctx.beginPath();
    ctx.strokeStyle = chart.color;
    for (let j = 0; j < chart.data.length; j++) {
      const pointX = chartX + (j / (chart.data.length - 1)) * chartWidth;
      const pointY = chartY + chartHeight - (chart.data[j] / chart.max) * chartHeight;

      if (j === 0) {
        ctx.moveTo(pointX, pointY);
      } else {
        ctx.lineTo(pointX, pointY);
      }
    }
    ctx.stroke();

    // Draw target line
    ctx.beginPath();
    ctx.strokeStyle = '#888';
    ctx.setLineDash([2, 2]);
    const targetY = chartY + chartHeight - (chart.target / chart.max) * chartHeight;
    ctx.moveTo(chartX, targetY);
    ctx.lineTo(chartX + chartWidth, targetY);
    ctx.stroke();
    ctx.setLineDash([]); // Reset line dash
  });
}
