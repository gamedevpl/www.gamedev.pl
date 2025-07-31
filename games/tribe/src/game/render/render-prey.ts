import { PreyEntity } from '../entities/characters/prey/prey-types';
import { TribePrey2D } from '../../../../../tools/asset-generator/generator-assets/src/tribe-prey-2d/tribe-prey-2d.js';
import {
  CHARACTER_RADIUS,
  UI_BT_DEBUG_X_OFFSET,
  UI_BT_DEBUG_Y_OFFSET,
  UI_BT_DEBUG_FONT_SIZE,
  UI_BT_DEBUG_LINE_HEIGHT,
  UI_BT_DEBUG_STATUS_SUCCESS_COLOR,
  UI_BT_DEBUG_STATUS_FAILURE_COLOR,
  UI_BT_DEBUG_STATUS_RUNNING_COLOR,
  UI_BT_DEBUG_STATUS_NOT_EVALUATED_COLOR,
  UI_BT_DEBUG_HEATMAP_COLD_COLOR,
  UI_BT_DEBUG_HEATMAP_HOT_COLOR,
  UI_BT_DEBUG_HEATMAP_DECAY_TIME_SECONDS,
  GAME_DAY_IN_REAL_SECONDS,
  HOURS_PER_GAME_DAY,
  UI_BT_DEBUG_BACKGROUND_COLOR,
  UI_BT_DEBUG_INDENT_SIZE,
  UI_BT_DEBUG_HISTOGRAM_MAX_WIDTH,
  UI_BT_DEBUG_HISTOGRAM_BAR_HEIGHT,
  UI_BT_DEBUG_HISTOGRAM_X_OFFSET,
  UI_BT_DEBUG_HISTOGRAM_WINDOW_SECONDS,
  AI_UPDATE_INTERVAL,
} from '../world-consts';
import { BehaviorNode, NodeStatus } from '../ai/behavior-tree/behavior-tree-types';
import { lerpColor } from '../utils/math-utils';
import { EntityId } from '../entities/entities-types';

// Map prey actions to sprite stances
const preyStanceMap: Record<string, string> = {
  'grazing': 'eat',
  'moving': 'walk',
  'procreating': 'procreate',
  'feeding': 'eat', // Feeding children uses same stance as eating
  'idle': 'idle',
};

/**
 * Renders debug information for a prey entity.
 * @param ctx Canvas rendering context
 * @param prey The prey entity to render debug info for
 */
function renderPreyDebugInfo(ctx: CanvasRenderingContext2D, prey: PreyEntity): void {
  const { radius, position, activeAction = 'idle' } = prey;
  const stateName = prey.stateMachine?.[0] || 'N/A';
  const yOffset = prey.isAdult ? CHARACTER_RADIUS + 20 : CHARACTER_RADIUS * 0.6 + 20;

  ctx.save();
  ctx.fillStyle = 'white';
  ctx.font = '10px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(`Action: ${activeAction}`, position.x, position.y - yOffset);
  ctx.fillText(`State: ${stateName}`, position.x, position.y - yOffset + 10);
  ctx.fillText(`HP: ${prey.hitpoints}`, position.x, position.y - yOffset + 20);
  ctx.fillText(`Hunger: ${Math.round(prey.hunger)}`, position.x, position.y - yOffset + 30);
  ctx.fillText(`Age: ${Math.round(prey.age)}`, position.x, position.y - yOffset + 40);
  ctx.restore();

  // render character radius
  ctx.beginPath();
  ctx.arc(position.x, position.y, radius, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(0, 255, 0, 0.5)'; // Green for prey
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.closePath();
}

/**
 * Renders a debug visualization of the prey's behavior tree.
 * This function iterates through the entire static tree structure and displays the
 * real-time status of each node. Nodes that were not evaluated in the last
 * tick are shown as 'NOT_EVALUATED'.
 *
 * @param ctx The canvas rendering context.
 * @param prey The prey entity whose AI tree is to be rendered.
 * @param currentTime The current game time, used for heatmap calculations.
 */
function renderPreyBehaviorTreeDebug(ctx: CanvasRenderingContext2D, prey: PreyEntity, currentTime: number): void {
  if (!prey.aiBehaviorTree || !prey.aiBlackboard) {
    return;
  }
  const executionData = prey.aiBlackboard.getNodeExecutionData();

  ctx.save();
  ctx.font = `${UI_BT_DEBUG_FONT_SIZE}px Arial`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  const getColorForStatus = (status: NodeStatus | null): string => {
    switch (status) {
      case NodeStatus.SUCCESS:
        return UI_BT_DEBUG_STATUS_SUCCESS_COLOR;
      case NodeStatus.FAILURE:
        return UI_BT_DEBUG_STATUS_FAILURE_COLOR;
      case NodeStatus.RUNNING:
        return UI_BT_DEBUG_STATUS_RUNNING_COLOR;
      case NodeStatus.NOT_EVALUATED:
      case null:
      default:
        return UI_BT_DEBUG_STATUS_NOT_EVALUATED_COLOR;
    }
  };

  // Helper to calculate the required panel dimensions by traversing the static tree
  const calculateDimensions = (node: BehaviorNode): { width: number; height: number } => {
    if (!node.name || !executionData.has(node.name)) {
      return { width: 0, height: 0 };
    }

    let maxWidth = 0;
    let height = 0;

    const nodeExecutionInfo = executionData.get(node.name);
    const debugText = ` ${node.name}` + (nodeExecutionInfo?.debugInfo ? `: ${nodeExecutionInfo.debugInfo}` : '');
    const textWidth = ctx.measureText(debugText).width;
    const indentedWidth =
      (node.depth ?? 0) * UI_BT_DEBUG_INDENT_SIZE +
      8 + // Status circle
      textWidth +
      UI_BT_DEBUG_HISTOGRAM_X_OFFSET +
      UI_BT_DEBUG_HISTOGRAM_MAX_WIDTH +
      20; // Padding
    maxWidth = Math.max(maxWidth, indentedWidth);
    height += UI_BT_DEBUG_LINE_HEIGHT;

    if (node.children) {
      for (const child of node.children) {
        const childDimensions = calculateDimensions(child);
        maxWidth = Math.max(maxWidth, childDimensions.width);
        height += childDimensions.height;
      }
    } else if (node.child) {
      const childDimensions = calculateDimensions(node.child);
      maxWidth = Math.max(maxWidth, childDimensions.width);
      height += childDimensions.height;
    }

    return { width: maxWidth, height };
  };

  // Helper to recursively render each node of the tree
  const renderNode = (node: BehaviorNode, yPos: number, panelX: number, panelWidth: number): number => {
    if (!node.name || !executionData.has(node.name)) {
      return yPos;
    }
    let currentY = yPos;

    const nodeExecutionInfo = executionData.get(node.name);
    const xPos = panelX + 2 + (node.depth ?? 0) * UI_BT_DEBUG_INDENT_SIZE;

    let status = NodeStatus.NOT_EVALUATED;
    let textColor = UI_BT_DEBUG_HEATMAP_COLD_COLOR;
    let debugInfo = '';

    if (nodeExecutionInfo) {
      status = nodeExecutionInfo.status;
      debugInfo = nodeExecutionInfo.debugInfo;
      const decayTimeInGameHours =
        (UI_BT_DEBUG_HEATMAP_DECAY_TIME_SECONDS / GAME_DAY_IN_REAL_SECONDS) * HOURS_PER_GAME_DAY;
      const timeSinceExecuted = currentTime - nodeExecutionInfo.lastExecuted;
      const heat = Math.max(0, 1 - timeSinceExecuted / decayTimeInGameHours);
      textColor = lerpColor(UI_BT_DEBUG_HEATMAP_COLD_COLOR, UI_BT_DEBUG_HEATMAP_HOT_COLOR, heat);
      if (timeSinceExecuted > AI_UPDATE_INTERVAL) {
        status = NodeStatus.NOT_EVALUATED; // If too long since last execution, mark as NOT_EVALUATED
      }
    }

    const statusColor = getColorForStatus(status);

    // Draw status indicator
    ctx.fillStyle = statusColor;
    ctx.fillText('●', xPos, currentY);

    // Draw node name and debug info
    ctx.fillStyle = textColor;
    const nodeText = ` ${node.name}` + (debugInfo ? `: ${debugInfo}` : '');
    ctx.fillText(nodeText, xPos + 8, currentY);

    // Render histogram if execution data is available
    if (nodeExecutionInfo && nodeExecutionInfo.executionHistory.length > 0) {
      const { executionHistory } = nodeExecutionInfo;
      const historyWindowInGameHours =
        (UI_BT_DEBUG_HISTOGRAM_WINDOW_SECONDS / GAME_DAY_IN_REAL_SECONDS) * HOURS_PER_GAME_DAY;
      const historyEndTime = currentTime;
      const historyStartTime = historyEndTime - historyWindowInGameHours;

      const histogramStartX = panelX + panelWidth - UI_BT_DEBUG_HISTOGRAM_MAX_WIDTH - UI_BT_DEBUG_HISTOGRAM_X_OFFSET;
      let currentX = histogramStartX;
      const barY = currentY + (UI_BT_DEBUG_LINE_HEIGHT - UI_BT_DEBUG_HISTOGRAM_BAR_HEIGHT) / 2;

      const recordsBeforeWindow = executionHistory.filter((r) => r.time < historyStartTime);
      let lastStatus: NodeStatus | null =
        recordsBeforeWindow.length > 0 ? recordsBeforeWindow[recordsBeforeWindow.length - 1].status : null;
      let lastTime = historyStartTime;

      const recordsInWindow = executionHistory.filter((r) => r.time >= historyStartTime && r.time <= historyEndTime);
      const pixelsPerGameHour = UI_BT_DEBUG_HISTOGRAM_MAX_WIDTH / historyWindowInGameHours;

      ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.fillRect(histogramStartX, barY, UI_BT_DEBUG_HISTOGRAM_MAX_WIDTH, UI_BT_DEBUG_HISTOGRAM_BAR_HEIGHT);

      for (const record of recordsInWindow) {
        const segmentDuration = record.time - lastTime;
        const segmentWidth = segmentDuration * pixelsPerGameHour;

        if (segmentWidth > 0) {
          ctx.fillStyle = getColorForStatus(lastStatus);
          ctx.fillRect(currentX, barY, segmentWidth, UI_BT_DEBUG_HISTOGRAM_BAR_HEIGHT);
          currentX += segmentWidth;
        }

        lastStatus = record.status;
        lastTime = record.time;
      }

      if (currentTime - lastTime > AI_UPDATE_INTERVAL) {
        lastStatus = NodeStatus.NOT_EVALUATED; // If no new data, mark as NOT_EVALUATED
      }

      const finalSegmentDuration = historyEndTime - lastTime;
      const finalSegmentWidth = finalSegmentDuration * pixelsPerGameHour;
      ctx.fillStyle = getColorForStatus(lastStatus);
      const remainingWidth = histogramStartX + UI_BT_DEBUG_HISTOGRAM_MAX_WIDTH - currentX;
      ctx.fillRect(currentX, barY, Math.min(finalSegmentWidth, remainingWidth), UI_BT_DEBUG_HISTOGRAM_BAR_HEIGHT);
    }
    currentY += UI_BT_DEBUG_LINE_HEIGHT;

    // Recursively render children
    if (node.children) {
      for (const child of node.children) {
        currentY = renderNode(child, currentY, panelX, panelWidth);
      }
    } else if (node.child) {
      currentY = renderNode(node.child, currentY, panelX, panelWidth);
    }

    return currentY;
  };

  // --- Main execution --
  const { width: panelWidth, height: panelHeight } = calculateDimensions(prey.aiBehaviorTree);
  if (panelHeight === 0) {
    ctx.restore();
    return; // Don't render anything if the tree is empty or has no named nodes
  }
  const panelX = prey.position.x + UI_BT_DEBUG_X_OFFSET;
  const panelY = prey.position.y + UI_BT_DEBUG_Y_OFFSET - panelHeight / 2;

  // Draw background panel
  ctx.fillStyle = UI_BT_DEBUG_BACKGROUND_COLOR;
  ctx.fillRect(panelX, panelY, panelWidth, panelHeight + 4);

  // Start rendering from the root node
  renderNode(prey.aiBehaviorTree, panelY + 2, panelX, panelWidth);

  ctx.restore();
}

/**
 * Renders a prey entity using the asset generator sprite system.
 */
export function renderPrey(
  ctx: CanvasRenderingContext2D, 
  prey: PreyEntity,
  isDebugOn: boolean = false,
  currentTime: number = 0,
  debugEntityId?: EntityId,
): void {
  const { position, activeAction = 'idle' } = prey;
  
  // Adjust radius based on adult status
  const currentRadius = prey.isAdult ? prey.radius : prey.radius * 0.6;
  
  const stance = preyStanceMap[activeAction] || 'idle';
  
  // Use asset generator to render the prey sprite
  TribePrey2D.render(
    ctx,
    position.x - currentRadius,
    position.y - currentRadius,
    currentRadius * 2,
    currentRadius * 2,
    prey.animationProgress || 0,
    stance,
    {
      gender: prey.gender,
      age: prey.age,
      direction: [prey.direction?.x || 1, prey.direction?.y || 0],
      isPregnant: prey.isPregnant ?? false,
      hungryLevel: prey.hunger,
      geneCode: prey.geneCode, // Use actual genetic code
    }
  );

  // Health bar if injured
  if (prey.hitpoints < prey.maxHitpoints) {
    const barWidth = currentRadius * 1.5;
    const barHeight = 3;
    const barX = position.x - barWidth / 2;
    const barY = position.y - currentRadius - 8;

    // Background
    ctx.fillStyle = '#555';
    ctx.fillRect(barX, barY, barWidth, barHeight);

    // Health
    const healthRatio = prey.hitpoints / prey.maxHitpoints;
    ctx.fillStyle = healthRatio > 0.5 ? '#4CAF50' : healthRatio > 0.25 ? '#FFC107' : '#F44336';
    ctx.fillRect(barX, barY, barWidth * healthRatio, barHeight);
  }

  // Flee cooldown indicator (red outline when in flee cooldown)
  if (prey.fleeCooldown && prey.fleeCooldown > 0) {
    ctx.strokeStyle = '#FF0000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(position.x, position.y, currentRadius + 2, 0, 2 * Math.PI);
    ctx.stroke();
  }

  // Debug rendering
  const showDebug = isDebugOn && (debugEntityId === undefined || prey.id === debugEntityId);

  if (showDebug && prey.aiBlackboard) {
    renderPreyBehaviorTreeDebug(ctx, prey, currentTime);
  }

  if (showDebug) {
    renderPreyDebugInfo(ctx, prey);
  }
}