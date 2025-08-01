import { GameWorldState } from '../world-types';
import { getEcosystemBalancerStats, isQLearningEnabled } from '../ecosystem/ecosystem-balancer';
import {
  ECOSYSTEM_BALANCER_TARGET_BUSH_COUNT,
  ECOSYSTEM_BALANCER_TARGET_PREDATOR_POPULATION,
  ECOSYSTEM_BALANCER_TARGET_PREY_POPULATION,
  MAP_WIDTH,
  MAP_HEIGHT,
} from '../world-consts';
import { IndexedWorldState } from '../world-index/world-index-types';

interface PopulationHistory {
  time: number;
  prey: number;
  predators: number;
  bushes: number;
}

// Global history storage (persists across renders)
let populationHistory: PopulationHistory[] = [];
let lastRecordTime = 0;

const HISTORY_INTERVAL = 3600; // Record every hour (in game time)
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

  // Record population data
  if (gameState.time - lastRecordTime >= HISTORY_INTERVAL) {
    populationHistory.push({
      time: gameState.time,
      prey: preyCount,
      predators: predatorCount,
      bushes: bushCount,
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

  const qlStats = getEcosystemBalancerStats();
  const isQLEnabled = isQLearningEnabled();

  // Game time calculations
  const gameYear = Math.floor(gameState.time / (24 * 365));
  const gameDay = Math.floor((gameState.time % (24 * 365)) / 24);
  const gameHour = Math.floor(gameState.time % 24);

  // Setup debugger panel
  const panelWidth = 400;
  const panelHeight = Math.min(canvasHeight * 0.8, 600);
  const panelX = canvasWidth - panelWidth - 10;
  const panelY = 10;

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

  ctx.fillStyle = 'white';
  ctx.font = '12px monospace';
  ctx.fillText(`Mode: ${isQLEnabled ? '✅ Active' : '❌ Disabled'}`, leftMargin, currentY);
  currentY += lineHeight;

  if (qlStats) {
    ctx.fillText(`Q-Table Size: ${qlStats.qTableSize} entries`, leftMargin, currentY);
    currentY += lineHeight;
    ctx.fillText(`Exploration Rate: ${(qlStats.explorationRate * 100).toFixed(1)}%`, leftMargin, currentY);
    currentY += lineHeight;
    ctx.fillStyle = qlStats.inSafetyMode ? '#ff6666' : '#66ff66';
    ctx.fillText(`Safety Mode: ${qlStats.inSafetyMode ? '🚨 ACTIVE' : '✅ INACTIVE'}`, leftMargin, currentY);
    currentY += lineHeight;
  }

  // Enhanced state space info
  ctx.fillStyle = '#888';
  ctx.font = '10px monospace';
  ctx.fillText('Enhanced state space includes:', leftMargin, currentY);
  currentY += 12;
  ctx.fillText('• Population levels & ratios', leftMargin, currentY);
  currentY += 11;
  ctx.fillText('• Population density per 1000px²', leftMargin, currentY);
  currentY += 11;
  ctx.fillText('• Population trends', leftMargin, currentY);
  currentY += 11;
  ctx.fillText('• Map-aware density targets', leftMargin, currentY);
  currentY += 20;

  // Population History Histogram (True Time-Based)
  ctx.fillStyle = '#66ccff';
  ctx.font = 'bold 13px monospace';
  ctx.fillText('📈 Population Trends Histogram', leftMargin, currentY);
  currentY += 20;

  renderPopulationHistogram(ctx, leftMargin, currentY, populationHistory);
  currentY += 160;

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

  ctx.fillText(`Prey: ${preyDensityPer1000.toFixed(2)} (target: ${preyTargetDensity})`, leftMargin, currentY);
  currentY += lineHeight;
  ctx.fillText(
    `Predators: ${predatorDensityPer1000.toFixed(2)} (target: ${predatorTargetDensity})`,
    leftMargin,
    currentY,
  );
  currentY += lineHeight;
  ctx.fillText(`Bushes: ${bushDensityPer1000.toFixed(2)} (target: ${bushTargetDensity})`, leftMargin, currentY);
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
  
  const getStatusColor = (percentage: number) => {
    if (percentage < 50) return '#ff4444';
    if (percentage < 80) return '#ffaa44';
    if (percentage > 120) return '#44aaff';
    return '#44ff44';
  };
  
  ctx.fillStyle = getStatusColor(preyPercentage);
  ctx.fillText(`Prey: ${preyCount}/${ECOSYSTEM_BALANCER_TARGET_PREY_POPULATION} (${preyPercentage}%)`, leftMargin, currentY);
  currentY += lineHeight;
  
  ctx.fillStyle = getStatusColor(predatorPercentage);
  ctx.fillText(`Predators: ${predatorCount}/${ECOSYSTEM_BALANCER_TARGET_PREDATOR_POPULATION} (${predatorPercentage}%)`, leftMargin, currentY);
  currentY += lineHeight;
  
  ctx.fillStyle = getStatusColor(bushPercentage);
  ctx.fillText(`Bushes: ${bushCount}/${ECOSYSTEM_BALANCER_TARGET_BUSH_COUNT} (${bushPercentage}%)`, leftMargin, currentY);
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

  // Population History Mini-Chart
  const recentHistory = populationHistory.slice(-20);
  if (recentHistory.length > 1) {
    ctx.fillStyle = '#66ccff';
    ctx.font = 'bold 13px monospace';
    ctx.fillText('📈 Population Trends (Last 20 Points)', leftMargin, currentY);
    currentY += 20;

    renderPopulationTrends(ctx, leftMargin, currentY, recentHistory);
  }

  // Footer
  ctx.fillStyle = '#888';
  ctx.font = '10px monospace';
  ctx.textAlign = 'center';
  ctx.fillText("Press 'E' to toggle this debugger", panelX + panelWidth / 2, panelY + panelHeight - 10);

  // Restore context state
  ctx.restore();
}

/**
 * Renders population histogram showing actual time-based trends
 */
function renderPopulationHistogram(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  history: PopulationHistory[],
): void {
  if (history.length < 2) {
    ctx.fillStyle = '#888';
    ctx.font = '12px monospace';
    ctx.fillText('Collecting population data...', x, y + 50);
    return;
  }

  const chartWidth = 350;
  const chartHeight = 120;
  const barWidth = Math.max(1, chartWidth / history.length);
  
  // Find max values for scaling
  const maxPrey = Math.max(...history.map(h => h.prey), ECOSYSTEM_BALANCER_TARGET_PREY_POPULATION);
  const maxPredators = Math.max(...history.map(h => h.predators), ECOSYSTEM_BALANCER_TARGET_PREDATOR_POPULATION);
  const maxBushes = Math.max(...history.map(h => h.bushes), ECOSYSTEM_BALANCER_TARGET_BUSH_COUNT);

  // Chart border
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, chartWidth, chartHeight);

  // Draw time axis
  ctx.fillStyle = '#888';
  ctx.font = '10px monospace';
  ctx.textAlign = 'center';
  
  // Show time labels (every 5th point)
  for (let i = 0; i < history.length; i += 5) {
    const barX = x + i * barWidth;
    const timeHours = Math.floor(history[i].time);
    const timeLabel = `${Math.floor(timeHours / 24)}d${timeHours % 24}h`;
    ctx.fillText(timeLabel, barX, y + chartHeight + 12);
  }

  // Draw stacked histogram bars for each time point
  for (let i = 0; i < history.length; i++) {
    const barX = x + i * barWidth;
    const h = history[i];
    
    // Calculate bar heights (proportional to max values)
    const preyHeight = (h.prey / maxPrey) * chartHeight;
    const predatorHeight = (h.predators / maxPredators) * chartHeight;  
    const bushHeight = (h.bushes / maxBushes) * chartHeight;
    
    // Draw prey bar (green)
    ctx.fillStyle = '#44ff44';
    ctx.fillRect(barX, y + chartHeight - preyHeight, barWidth - 1, preyHeight);
    
    // Draw predator bar (red) - overlay
    ctx.fillStyle = '#ff4444';
    ctx.fillRect(barX, y + chartHeight - predatorHeight, barWidth - 1, predatorHeight);
    
    // Draw bush bar (orange) - overlay with alpha for visibility
    ctx.fillStyle = 'rgba(255, 170, 68, 0.7)';
    ctx.fillRect(barX, y + chartHeight - bushHeight, barWidth - 1, bushHeight);
  }
  
  // Draw target lines
  ctx.setLineDash([2, 2]);
  ctx.strokeStyle = '#888';
  
  // Prey target line
  const preyTargetY = y + chartHeight - (ECOSYSTEM_BALANCER_TARGET_PREY_POPULATION / maxPrey) * chartHeight;
  ctx.beginPath();
  ctx.moveTo(x, preyTargetY);
  ctx.lineTo(x + chartWidth, preyTargetY);
  ctx.stroke();
  
  // Predator target line
  const predatorTargetY = y + chartHeight - (ECOSYSTEM_BALANCER_TARGET_PREDATOR_POPULATION / maxPredators) * chartHeight;
  ctx.beginPath();
  ctx.moveTo(x, predatorTargetY);
  ctx.lineTo(x + chartWidth, predatorTargetY);
  ctx.stroke();
  
  ctx.setLineDash([]); // Reset line dash

  // Legend
  ctx.fillStyle = 'white';
  ctx.font = '10px monospace';
  ctx.textAlign = 'left';
  
  ctx.fillStyle = '#44ff44';
  ctx.fillRect(x, y - 15, 10, 8);
  ctx.fillStyle = 'white';
  ctx.fillText('Prey', x + 15, y - 8);
  
  ctx.fillStyle = '#ff4444';
  ctx.fillRect(x + 60, y - 15, 10, 8);
  ctx.fillStyle = 'white';
  ctx.fillText('Predators', x + 75, y - 8);
  
  ctx.fillStyle = 'rgba(255, 170, 68, 0.7)';
  ctx.fillRect(x + 140, y - 15, 10, 8);
  ctx.fillStyle = 'white';
  ctx.fillText('Bushes', x + 155, y - 8);
  
  ctx.fillStyle = '#888';
  ctx.fillText('--- Target Lines', x + 210, y - 8);
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
  ];

  charts.forEach((chart, i) => {
    const chartX = x + i * (chartWidth + chartSpacing);
    const chartY = y;

    // Chart label
    ctx.fillStyle = chart.color;
    ctx.font = '10px monospace';
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
