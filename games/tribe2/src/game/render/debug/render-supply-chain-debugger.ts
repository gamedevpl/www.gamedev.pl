import { GameWorldState } from '../../world-types';
import { UI_FONT_SIZE, UI_PADDING } from '../../ui/ui-consts';
import { getTribeLeaderForCoordination } from '../../entities/tribe/tribe-task-utils';
import { IndexedWorldState } from '../../world-index/world-index-types';
import { getTribeDemands } from '../../ai/supply-chain/tribe-logistics-utils';
import { HumanEntity } from '../../entities/characters/human/human-types';
import { renderEntityHighlight } from '../render-highlights';
import { TribeRole } from '../../entities/tribe/tribe-types';

/**
 * Renders the supply chain debugger panel showing registered demands and their status
 */
export function renderSupplyChainDebugger(
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

  const leader = getTribeLeaderForCoordination(debugCharacter, gameState);
  if (!leader || !leader.aiBlackboard) {
    return;
  }

  // Get demands from the leader's blackboard
  const demands = getTribeDemands(leader.aiBlackboard);

  // Setup debugger panel
  const panelWidth = 500;
  const panelHeight = Math.min(canvasHeight * 0.9, 700);
  const panelX = canvasWidth - panelWidth - 10;
  const panelY = UI_PADDING + UI_FONT_SIZE * 2;

  // Store the panel's rect in the game state for input handling
  gameState.debugPanelRect = { x: panelX, y: panelY, width: panelWidth, height: panelHeight };

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

  const lineHeight = 14;
  const leftMargin = panelX + 15;

  let currentY = panelY + 20;

  // Title
  ctx.fillStyle = '#66ccff';
  ctx.font = 'bold 14px monospace';
  ctx.fillText('📦 Supply Chain Debugger', leftMargin, currentY);
  currentY += 25;

  // Tribe info
  ctx.fillStyle = '#aaaaaa';
  ctx.font = '11px monospace';
  ctx.fillText(`Tribe Leader: ${leader.isPlayer ? 'Player' : '#' + leader.id}`, leftMargin, currentY);
  currentY += lineHeight;
  ctx.fillText(`Current Time: ${gameState.time.toFixed(1)}h`, leftMargin, currentY);
  currentY += 20;

  // Calculate where scrollable content starts
  const contentStartY = currentY;
  const contentAreaHeight = panelHeight - (contentStartY - panelY) - 30; // Reserve space for footer

  // Render scrollable content
  renderScrollableContent(
    ctx,
    gameState,
    demands,
    leftMargin,
    contentStartY,
    panelWidth - 30,
    contentAreaHeight,
    lineHeight,
  );

  // Footer (outside scrollable area)
  ctx.fillStyle = '#888';
  ctx.font = '10px monospace';
  ctx.textAlign = 'center';
  ctx.fillText("Press 'Shift+4' to toggle this debugger", panelX + panelWidth / 2, panelY + panelHeight - 10);

  // Restore context state
  ctx.restore();
}

function renderScrollableContent(
  ctx: CanvasRenderingContext2D,
  gameState: GameWorldState,
  demands: ReturnType<typeof getTribeDemands>,
  x: number,
  y: number,
  width: number,
  height: number,
  lineHeight: number,
): void {
  const scrollX = gameState.debugPanelScroll?.x ?? 0;
  const scrollY = gameState.debugPanelScroll?.y ?? 0;

  // Create a clipping region for the scrollable content
  ctx.save();
  ctx.beginPath();
  ctx.rect(x - 5, y, width + 10, height);
  ctx.clip();

  // Apply scroll translation
  ctx.translate(-scrollX, -scrollY);

  let currentY = y;

  // Demands section
  ctx.fillStyle = '#66ccff';
  ctx.font = 'bold 13px monospace';
  ctx.fillText(`📋 Active Demands (${demands.length})`, x, currentY);
  currentY += 18;

  if (demands.length === 0) {
    ctx.fillStyle = '#888888';
    ctx.font = '11px monospace';
    ctx.fillText('No active demands', x, currentY);
    currentY += lineHeight;
  } else {
    // Sort demands by update time (most recent first)
    const sortedDemands = [...demands].sort((a, b) => b.updatedAt - a.updatedAt);

    sortedDemands.forEach((demand, index) => {
      // Get requester entity
      const requester = gameState.entities.entities[demand.requesterId] as HumanEntity | undefined;
      let requesterName = requester
        ? requester.isPlayer
          ? 'Player'
          : `Human #${requester.id}`
        : `Unknown #${demand.requesterId}`;
      if (requester) {
        requesterName += ` (Food: ${requester.food.length}), Active action: ${requester.activeAction || 'idle'}`;
      }

      // Get mover entity if claimed
      let moverName = 'None';
      if (demand.claimedBy) {
        const mover = gameState.entities.entities[demand.claimedBy] as HumanEntity | undefined;
        moverName = mover ? (mover.isPlayer ? 'Player' : `Human #${mover.id}`) : `Unknown #${demand.claimedBy}`;
        if (mover) {
          moverName += ' (Food: ' + mover.food.length + '), Active action: ' + (mover.activeAction || 'idle') + ')';
        }
      }

      // Time since last update
      const timeSinceUpdate = gameState.time - demand.updatedAt;

      // Draw demand card
      const cardY = currentY;
      const cardHeight = lineHeight * 5 + 10;

      // Card background
      ctx.fillStyle = demand.claimedBy ? 'rgba(50, 100, 50, 0.3)' : 'rgba(50, 50, 50, 0.3)';
      ctx.fillRect(x - 5, cardY - 2, width, cardHeight);

      // Card border
      ctx.strokeStyle = demand.claimedBy ? '#44ff44' : '#666666';
      ctx.lineWidth = 1;
      ctx.strokeRect(x - 5, cardY - 2, width, cardHeight);

      // Demand index
      ctx.fillStyle = '#ffaa00';
      ctx.font = 'bold 12px monospace';
      ctx.fillText(`#${index + 1}`, x, currentY);
      currentY += lineHeight;

      // Requester
      ctx.fillStyle = '#ffffff';
      ctx.font = '11px monospace';
      ctx.fillText(`Requester: ${requesterName}`, x + 10, currentY);
      currentY += lineHeight;

      // Resource type
      ctx.fillStyle = '#ffff88';
      ctx.fillText(`Resource: ${demand.resourceType}`, x + 10, currentY);
      currentY += lineHeight;

      // Status
      ctx.fillStyle = demand.claimedBy ? '#44ff44' : '#ff8844';
      ctx.fillText(`Status: ${demand.claimedBy ? 'Claimed' : 'Pending'}`, x + 10, currentY);
      currentY += lineHeight;

      // Claimed by (if applicable)
      if (demand.claimedBy) {
        ctx.fillStyle = '#aaffaa';
        ctx.fillText(`Mover: ${moverName}`, x + 10, currentY);
      } else {
        ctx.fillStyle = '#888888';
        ctx.fillText(`Mover: ${moverName}`, x + 10, currentY);
      }
      currentY += lineHeight;

      // Time info
      ctx.fillStyle = '#aaaaaa';
      ctx.font = '10px monospace';
      ctx.fillText(`Updated: ${timeSinceUpdate.toFixed(1)}h ago`, x + 10, currentY);
      currentY += lineHeight + 5;
    });
  }

  currentY += 10;

  // Statistics section
  ctx.fillStyle = '#66ccff';
  ctx.font = 'bold 13px monospace';
  ctx.fillText('📊 Statistics', x, currentY);
  currentY += 18;

  const pendingDemands = demands.filter((d) => !d.claimedBy).length;
  const claimedDemands = demands.filter((d) => d.claimedBy).length;

  ctx.fillStyle = '#ffffff';
  ctx.font = '11px monospace';
  ctx.fillText(`Total Demands: ${demands.length}`, x, currentY);
  currentY += lineHeight;

  ctx.fillStyle = '#ff8844';
  ctx.fillText(`Pending: ${pendingDemands}`, x, currentY);
  currentY += lineHeight;

  ctx.fillStyle = '#44ff44';
  ctx.fillText(`Claimed: ${claimedDemands}`, x, currentY);
  currentY += lineHeight;

  // Calculate total content height
  const totalContentHeight = currentY - y;

  // Store content dimensions for input handlers
  gameState.debugPanelContentSize = { width: width, height: totalContentHeight };

  ctx.restore();
}

/**
 * Renders visual highlights around entities involved in supply chain demands.
 * Demanders are highlighted in red/orange, movers are highlighted in green.
 */
export function renderSupplyChainHighlights(
  ctx: CanvasRenderingContext2D,
  human: HumanEntity,
  gameState: GameWorldState,
): void {
  if (!gameState.debugCharacterId) {
    return;
  }

  const debugCharacter = (gameState as IndexedWorldState).search.human.byProperty('id', gameState.debugCharacterId)[0];
  if (!debugCharacter) {
    return;
  }

  const leader = getTribeLeaderForCoordination(debugCharacter, gameState);
  if (!leader || !leader.aiBlackboard) {
    return;
  }

  if (leader.id !== human.leaderId) {
    return;
  }

  // Get demands from the leader's blackboard
  const demands = getTribeDemands(leader.aiBlackboard);

  if (demands.some((demand) => demand.requesterId === human.id)) {
    renderEntityHighlight(
      ctx,
      human,
      human.radius + 15,
      '#ff6644', // Red/orange for demanders
      3,
      2.0,
      gameState.time,
    );
  }

  // Render highlights for movers (green)
  if (human.tribeRole === TribeRole.Mover) {
    renderEntityHighlight(
      ctx,
      human,
      human.radius + 15,
      '#44ff44', // Green for movers
      3,
      2.0,
      gameState.time,
    );
  }
}
