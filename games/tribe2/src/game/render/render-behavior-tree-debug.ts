import { AI_UPDATE_INTERVAL } from '../ai-consts.ts';
import { GAME_DAY_IN_REAL_SECONDS, HOURS_PER_GAME_DAY } from '../game-consts.ts';
import {
  UI_BT_DEBUG_BACKGROUND_COLOR,
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
  UI_BT_DEBUG_X_OFFSET,
  UI_BT_DEBUG_Y_OFFSET,
} from '../ui-consts.ts';
import { BehaviorNode, NodeStatus } from '../ai/behavior-tree/behavior-tree-types';
import { lerpColor } from '../utils/math-utils';
import { CharacterEntity } from '../entities/characters/character-types';
import { humanBehaviorTree } from '../ai/human-ai-update.ts';
import { predatorBehaviorTree, preyBehaviorTree } from '../ai/animal-ai-update.ts';

/**
 * Renders a debug visualization of a character's behavior tree.
 * This function iterates through the entire static tree structure and displays the
 * real-time status of each node. Nodes that were not evaluated in the last
 * tick are shown as 'NOT_EVALUATED'.
 *
 * @param ctx The canvas rendering context.
 * @param character The character entity whose AI tree is to be rendered.
 * @param currentTime The current game time, used for heatmap calculations.
 */
export function renderBehaviorTreeDebug<T extends CharacterEntity>(
  ctx: CanvasRenderingContext2D,
  character: CharacterEntity,
  currentTime: number,
): void {
  if (!character.aiBlackboard) {
    return;
  }
  const executionData = character.aiBlackboard.nodeExecutionData;
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
  ) as BehaviorNode<T> | null;
  if (!tree) {
    return;
  }

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
  const calculateDimensions = (node: BehaviorNode<T>): { width: number; height: number } => {
    if (!node.name || !executionData[node.name]) {
      return { width: 0, height: 0 };
    }

    let maxWidth = 0;
    let height = 0;

    const nodeExecutionInfo = executionData[node.name];
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
  const renderNode = (node: BehaviorNode<T>, yPos: number, panelX: number, panelWidth: number): number => {
    if (!node.name || !executionData[node.name]) {
      return yPos;
    }
    let currentY = yPos;

    const nodeExecutionInfo = executionData[node.name];
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
  const { width: panelWidth, height: panelHeight } = calculateDimensions(tree);
  if (panelHeight === 0) {
    ctx.restore();
    return; // Don't render anything if the tree is empty or has no named nodes
  }
  const panelX = character.position.x + UI_BT_DEBUG_X_OFFSET;
  const panelY = character.position.y + UI_BT_DEBUG_Y_OFFSET - panelHeight / 2;

  // Draw background panel
  ctx.fillStyle = UI_BT_DEBUG_BACKGROUND_COLOR;
  ctx.fillRect(panelX, panelY, panelWidth, panelHeight + 4);

  // Start rendering from the root node
  renderNode(tree, panelY + 2, panelX, panelWidth);

  ctx.restore();
}
