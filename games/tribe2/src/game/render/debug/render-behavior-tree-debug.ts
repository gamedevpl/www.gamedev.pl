import { AI_UPDATE_INTERVAL } from '../../ai-consts.ts';
import { GAME_DAY_IN_REAL_SECONDS, HOURS_PER_GAME_DAY } from '../../game-consts.ts';
import {
  UI_BT_DEBUG_FONT_SIZE,
  UI_BT_DEBUG_HEATMAP_COLD_COLOR,
  UI_BT_DEBUG_HEATMAP_DECAY_TIME_SECONDS,
  UI_BT_DEBUG_HEATMAP_HOT_COLOR,
  UI_BT_DEBUG_HISTOGRAM_BAR_HEIGHT,
  UI_BT_DEBUG_HISTOGRAM_MAX_WIDTH,
  UI_BT_DEBUG_HISTOGRAM_WINDOW_SECONDS,
  UI_BT_DEBUG_HISTOGRAM_X_OFFSET,
  UI_BT_DEBUG_INDENT_SIZE,
  UI_BT_DEBUG_LINE_HEIGHT,
  UI_BT_DEBUG_STATUS_FAILURE_COLOR,
  UI_BT_DEBUG_STATUS_NOT_EVALUATED_COLOR,
  UI_BT_DEBUG_STATUS_RUNNING_COLOR,
  UI_BT_DEBUG_STATUS_SUCCESS_COLOR,
  UI_FONT_SIZE,
  UI_PADDING,
} from '../../ui/ui-consts.ts';
import { BehaviorNode, NodeStatus } from '../../ai/behavior-tree/behavior-tree-types.ts';
import { lerpColor } from '../../utils/math-utils.ts';
import { CharacterEntity } from '../../entities/characters/character-types.ts';
import { humanBehaviorTree } from '../../ai/human-ai-update.ts';
import { predatorBehaviorTree, preyBehaviorTree } from '../../ai/animal-ai-update.ts';
import { GameWorldState } from '../../world-types.ts';

/**
 * Renders the behavior tree debugger panel.
 * This function displays the real-time status of the behavior tree for the selected debug character.
 *
 * @param ctx The canvas rendering context.
 * @param gameState The current game world state.
 * @param canvasWidth The width of the canvas.
 * @param canvasHeight The height of the canvas.
 */
export function renderBehaviorTreeDebugger(
  ctx: CanvasRenderingContext2D,
  gameState: GameWorldState,
  canvasWidth: number,
  canvasHeight: number,
): void {
  const { debugCharacterId, time: currentTime } = gameState;

  // Setup debugger panel
  const panelWidth = 500;
  const panelHeight = Math.min(canvasHeight * 0.9, 800);
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

  // Setup text rendering for header
  ctx.fillStyle = 'white';
  ctx.font = '12px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  let currentY = panelY + 20;
  const leftMargin = panelX + 15;

  // Title
  ctx.fillStyle = '#66ccff';
  ctx.font = 'bold 14px monospace';
  ctx.fillText('🧠 Behavior Tree Debugger', leftMargin, currentY);
  currentY += 25;

  if (!debugCharacterId) {
    ctx.fillStyle = '#888';
    ctx.font = '12px monospace';
    ctx.fillText('No character selected for debugging.', leftMargin, currentY);
    ctx.fillText('Click on a character to inspect behavior.', leftMargin, currentY + 20);
    ctx.restore();
    return;
  }

  const character = gameState.entities.entities[debugCharacterId] as CharacterEntity | undefined;

  if (!character) {
    ctx.fillStyle = '#ff4444';
    ctx.font = '12px monospace';
    ctx.fillText(`Character #${debugCharacterId} not found (might be dead).`, leftMargin, currentY);
    ctx.restore();
    return;
  }

  if (!character.aiBlackboard) {
    ctx.fillStyle = '#ffaa44';
    ctx.font = '12px monospace';
    ctx.fillText(`Character #${debugCharacterId} has no AI Blackboard.`, leftMargin, currentY);
    ctx.restore();
    return;
  }

  // Display character info
  ctx.fillStyle = 'white';
  ctx.font = '12px monospace';
  ctx.fillText(`Character: ${character.type} #${character.id} (${character.age.toFixed(1)}y)`, leftMargin, currentY);
  currentY += 20;

  // Render the tree content
  renderTreeContent(
    ctx,
    character,
    currentTime,
    leftMargin,
    currentY,
    panelWidth - 30,
    panelHeight - (currentY - panelY) - 10,
    gameState,
  );

  // Footer
  ctx.fillStyle = '#888';
  ctx.font = '10px monospace';
  ctx.textAlign = 'center';
  ctx.fillText("Press '~' to toggle this debugger", panelX + panelWidth / 2, panelY + panelHeight - 10);

  ctx.restore();
}

function renderTreeContent(
  ctx: CanvasRenderingContext2D,
  character: CharacterEntity,
  currentTime: number,
  x: number,
  y: number,
  width: number,
  height: number,
  gameState: GameWorldState,
): void {
  const executionData = character.aiBlackboard!.nodeExecutionData;
  // We cast the tree to BehaviorNode<any> because the specific character type (Human, Predator, Prey)
  // doesn't matter for rendering, only the node structure and blackboard data.
  const tree = (
    character.type === 'human'
      ? humanBehaviorTree
      : character.type === 'predator'
      ? predatorBehaviorTree
      : character.type === 'prey'
      ? preyBehaviorTree
      : null
  ) as BehaviorNode<CharacterEntity> | null;

  if (!tree) {
    return;
  }

  const scrollX = gameState.debugPanelScroll?.x ?? 0;
  const scrollY = gameState.debugPanelScroll?.y ?? 0;

  // Create a clipping region for the tree content
  ctx.save();
  ctx.beginPath();
  ctx.rect(x - 5, y, width + 10, height);
  ctx.clip();

  // Apply scroll translation
  ctx.translate(-scrollX, -scrollY);

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

  let maxContentWidth = 0;

  // Helper to recursively render each node of the tree
  const renderNode = (node: BehaviorNode<CharacterEntity>, yPos: number): number => {
    if (!node.name || !executionData[node.name]) {
      return yPos;
    }
    let currentY = yPos;
    const isVisible = currentY + UI_BT_DEBUG_LINE_HEIGHT > y + scrollY && currentY < y + height + scrollY;

    const nodeExecutionInfo = executionData[node.name];
    const xPos = x + (node.depth ?? 0) * UI_BT_DEBUG_INDENT_SIZE;

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
    const nodeText = ` ${node.name}` + (debugInfo ? `: ${debugInfo}` : '');

    // Always calculate content width for scroll clamping
    const textWidth = ctx.measureText(nodeText).width;
    const histogramTotalWidth = UI_BT_DEBUG_HISTOGRAM_MAX_WIDTH + UI_BT_DEBUG_HISTOGRAM_X_OFFSET;
    const currentLineWidth = xPos - x + 8 + textWidth + histogramTotalWidth;
    if (currentLineWidth > maxContentWidth) {
      maxContentWidth = currentLineWidth;
    }

    // --- Draw only if visible ---
    if (isVisible) {
      // Draw status indicator
      ctx.fillStyle = statusColor;
      ctx.fillText('●', xPos, currentY);

      // Draw node name and debug info
      ctx.fillStyle = textColor;
      ctx.fillText(nodeText, xPos + 8, currentY);

      // Render histogram if execution data is available
      if (nodeExecutionInfo && nodeExecutionInfo.executionHistory.length > 0) {
        const { executionHistory } = nodeExecutionInfo;
        const historyWindowInGameHours =
          (UI_BT_DEBUG_HISTOGRAM_WINDOW_SECONDS / GAME_DAY_IN_REAL_SECONDS) * HOURS_PER_GAME_DAY;
        const historyEndTime = currentTime;
        const historyStartTime = historyEndTime - historyWindowInGameHours;

        const histogramStartX = x + width - UI_BT_DEBUG_HISTOGRAM_MAX_WIDTH - UI_BT_DEBUG_HISTOGRAM_X_OFFSET;
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
          lastStatus = NodeStatus.NOT_EVALUATED;
        }

        const finalSegmentDuration = historyEndTime - lastTime;
        const finalSegmentWidth = finalSegmentDuration * pixelsPerGameHour;
        ctx.fillStyle = getColorForStatus(lastStatus);
        const remainingWidth = histogramStartX + UI_BT_DEBUG_HISTOGRAM_MAX_WIDTH - currentX;
        ctx.fillRect(currentX, barY, Math.min(finalSegmentWidth, remainingWidth), UI_BT_DEBUG_HISTOGRAM_BAR_HEIGHT);
      }
    }

    currentY += UI_BT_DEBUG_LINE_HEIGHT;

    // Recursively process children to calculate total height
    if (node.children) {
      for (const child of node.children) {
        currentY = renderNode(child, currentY);
      }
    } else if (node.child) {
      currentY = renderNode(node.child, currentY);
    }

    return currentY;
  };

  // Start rendering from the root node
  const finalY = renderNode(tree, y);
  const totalContentHeight = finalY - y;

  // Store content dimensions for input handlers
  gameState.debugPanelContentSize = { width: maxContentWidth, height: totalContentHeight };

  ctx.restore();
}
