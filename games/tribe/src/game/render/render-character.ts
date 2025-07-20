import { HumanEntity } from '../entities/characters/human/human-types';
import { BehaviorNode, NodeStatus } from '../ai/behavior-tree/behavior-tree-types';
import {
  PLAYER_CHILD_HIGHLIGHT_COLOR,
  PLAYER_HEIR_HIGHLIGHT_COLOR,
  PLAYER_HIGHLIGHT_COLOR,
  PLAYER_CROWN_SIZE,
  PLAYER_HEIR_CROWN_SIZE,
  PLAYER_CHILD_CROWN_SIZE,
  PLAYER_PARENT_CROWN_SIZE,
  PLAYER_PARENT_HIGHLIGHT_COLOR,
  PLAYER_PARTNER_CROWN_SIZE,
  PLAYER_PARTNER_HIGHLIGHT_COLOR,
  CHARACTER_RADIUS,
  NON_FAMILY_CLAIM_COLOR,
  UI_ATTACK_PROGRESS_BAR_WIDTH,
  UI_ATTACK_PROGRESS_BAR_HEIGHT,
  UI_ATTACK_PROGRESS_BAR_Y_OFFSET,
  UI_ATTACK_BUILDUP_BAR_COLOR,
  UI_BAR_BACKGROUND_COLOR,
  HUMAN_ATTACK_BUILDUP_HOURS,
  UI_ATTACK_COOLDOWN_BAR_COLOR,
  HUMAN_ATTACK_COOLDOWN_HOURS,
  TRIBE_BADGE_SIZE,
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
  CHARACTER_CHILD_RADIUS,
  AI_UPDATE_INTERVAL,
} from '../world-consts';
import { TribeHuman2D } from '../../../../../tools/asset-generator/generator-assets/src/tribe-human-2d/tribe-human-2d.js';
import { HUMAN_ATTACKING, HumanAttackingStateData } from '../entities/characters/human/states/human-state-types';
import { drawProgressBar } from './render-ui';
import { lerpColor } from '../utils/math-utils';
import { EntityId } from '../entities/entities-types';

type Stance = 'idle' | 'walk' | 'eat' | 'gathering' | 'procreate' | 'dead' | 'attacking' | 'planting';

// Mapping from HumanEntity activeAction to render stance
const actionToStanceMap: Record<NonNullable<HumanEntity['activeAction']>, Stance> = {
  moving: 'walk',
  gathering: 'gathering',
  eating: 'eat',
  procreating: 'procreate',
  idle: 'idle',
  attacking: 'attacking',
  planting: 'gathering', // Use gathering stance for planting for now
  callingToAttack: 'idle',
  tribeSplitting: 'idle',
};

/**
 * Renders debug information for a human character.
 * @param ctx Canvas rendering context
 * @param human The human entity to render debug info for
 */
function renderDebugInfo(ctx: CanvasRenderingContext2D, human: HumanEntity): void {
  const { radius, position, activeAction = 'idle' } = human;
  const stateName = human.stateMachine?.[0] || 'N/A';
  const yOffset = human.isAdult ? CHARACTER_RADIUS + 20 : CHARACTER_RADIUS * 0.6 + 20;

  ctx.save();
  ctx.fillStyle = 'white';
  ctx.font = '10px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(`Action: ${activeAction}`, position.x, position.y - yOffset);
  ctx.fillText(`State: ${stateName}`, position.x, position.y - yOffset + 10);
  ctx.fillText(`HP: ${human.hitpoints}`, position.x, position.y - yOffset + 20);
  ctx.fillText(`Cooldown: ${human.attackCooldown || 'N/A'}`, position.x, position.y - yOffset + 30);
  ctx.restore();

  // render character radius
  ctx.beginPath();
  ctx.arc(position.x, position.y, radius, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.closePath();
}

/**
 * Renders a debug visualization of the human's behavior tree.
 * This function iterates through the entire static tree structure and displays the
 * real-time status of each node. Nodes that were not evaluated in the last
 * tick are shown as 'NOT_EVALUATED'.
 *
 * @param ctx The canvas rendering context.
 * @param human The human entity whose AI tree is to be rendered.
 * @param currentTime The current game time, used for heatmap calculations.
 */
function renderBehaviorTreeDebug(ctx: CanvasRenderingContext2D, human: HumanEntity, currentTime: number): void {
  if (!human.aiBehaviorTree || !human.aiBlackboard) {
    return;
  }
  const executionData = human.aiBlackboard.getNodeExecutionData();

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

  // --- Main execution ---
  const { width: panelWidth, height: panelHeight } = calculateDimensions(human.aiBehaviorTree);
  if (panelHeight === 0) {
    ctx.restore();
    return; // Don't render anything if the tree is empty or has no named nodes
  }
  const panelX = human.position.x + UI_BT_DEBUG_X_OFFSET;
  const panelY = human.position.y + UI_BT_DEBUG_Y_OFFSET - panelHeight / 2;

  // Draw background panel
  ctx.fillStyle = UI_BT_DEBUG_BACKGROUND_COLOR;
  ctx.fillRect(panelX, panelY, panelWidth, panelHeight + 4);

  // Start rendering from the root node
  renderNode(human.aiBehaviorTree, panelY + 2, panelX, panelWidth);

  ctx.restore();
}

function drawTribeBadge(
  ctx: CanvasRenderingContext2D,
  position: { x: number; y: number },
  badge: string,
  isAdult: boolean,
  crownSize: number,
): void {
  ctx.save();
  ctx.font = `${TRIBE_BADGE_SIZE}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(
    badge,
    position.x,
    position.y - (isAdult ? CHARACTER_RADIUS : CHARACTER_CHILD_RADIUS) - TRIBE_BADGE_SIZE - crownSize,
  );
  ctx.restore();
}

/**
 * Draws a crown above the character
 * @param ctx Canvas rendering context
 * @param position Character position
 * @param radius Character radius
 * @param size Size of the crown
 * @param color Color of the crown
 */
function drawCrown(
  ctx: CanvasRenderingContext2D,
  position: { x: number; y: number },
  radius: number,
  size: number,
  color: string,
): void {
  const x = position.x;
  const y = position.y - radius - size / 2;

  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;

  // Draw crown base
  ctx.beginPath();
  ctx.rect(x - size / 2, y, size, size / 2);
  ctx.fill();

  // Draw crown points
  ctx.beginPath();
  // Left point
  ctx.moveTo(x - size / 2, y);
  ctx.lineTo(x - size / 4, y - size / 3);
  ctx.lineTo(x - size / 6, y);

  // Middle point
  ctx.moveTo(x - size / 6, y);
  ctx.lineTo(x, y - size / 2);
  ctx.lineTo(x + size / 6, y);

  // Right point
  ctx.moveTo(x + size / 6, y);
  ctx.lineTo(x + size / 4, y - size / 3);
  ctx.lineTo(x + size / 2, y);

  ctx.stroke();
  ctx.restore();
}

function renderAttackProgress(ctx: CanvasRenderingContext2D, human: HumanEntity, currentTime: number) {
  const { position, radius } = human;
  const barX = position.x - UI_ATTACK_PROGRESS_BAR_WIDTH / 2;
  const barY = position.y - radius - UI_ATTACK_PROGRESS_BAR_Y_OFFSET;

  // Render attack buildup
  if (human.stateMachine?.[0] === HUMAN_ATTACKING) {
    const attackData = human.stateMachine[1] as HumanAttackingStateData;
    const timeSinceAttackStart = currentTime - attackData.attackStartTime;
    const buildupProgress = Math.min(timeSinceAttackStart / HUMAN_ATTACK_BUILDUP_HOURS, 1);

    drawProgressBar(
      ctx,
      barX,
      barY,
      UI_ATTACK_PROGRESS_BAR_WIDTH,
      UI_ATTACK_PROGRESS_BAR_HEIGHT,
      buildupProgress,
      UI_BAR_BACKGROUND_COLOR,
      UI_ATTACK_BUILDUP_BAR_COLOR,
    );
  }
  // Render attack cooldown
  else if (human.attackCooldown && human.attackCooldown > 0) {
    const cooldownProgress = 1 - human.attackCooldown / HUMAN_ATTACK_COOLDOWN_HOURS;
    drawProgressBar(
      ctx,
      barX,
      barY,
      UI_ATTACK_PROGRESS_BAR_WIDTH,
      UI_ATTACK_PROGRESS_BAR_HEIGHT,
      cooldownProgress,
      UI_BAR_BACKGROUND_COLOR,
      UI_ATTACK_COOLDOWN_BAR_COLOR,
    );
  }
}

/**
 * Renders a human character on the canvas
 * @param ctx Canvas rendering context
 * @param human The human entity to render
 */
export function renderCharacter(
  ctx: CanvasRenderingContext2D,
  human: HumanEntity,
  isPlayer: boolean = false,
  isPlayerParent: boolean = false,
  isPlayerChild: boolean = false,
  isPlayerPartner: boolean = false,
  isPlayerHeir: boolean = false,
  isPlayerAttackTarget: boolean = false,
  isDebugOn: boolean = false,
  currentTime: number,
  debugCharacterId?: EntityId,
): void {
  const { position, activeAction = 'idle' } = human;

  // Adjust character radius based on adult status
  const currentCharacterRadius = human.isAdult ? CHARACTER_RADIUS : CHARACTER_RADIUS * 0.6;

  const stance: Stance = actionToStanceMap[activeAction] || 'idle';

  TribeHuman2D.render(
    ctx,
    position.x - currentCharacterRadius,
    position.y - currentCharacterRadius,
    currentCharacterRadius * 2,
    currentCharacterRadius * 2,
    human.animationProgress || 0,
    stance,
    human.gender,
    human.age,
    [human.direction.x, human.direction.y],
    human.isPregnant ?? false,
    human.hunger,
  );

  // Draw attack target highlight
  if (isPlayerAttackTarget) {
    ctx.save();
    ctx.strokeStyle = NON_FAMILY_CLAIM_COLOR;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(position.x, position.y, currentCharacterRadius + 3, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.restore();
  }

  // Draw crowns for highlighted characters
  let crownSize: number | undefined;
  let highlightColor: string | undefined;

  if (isPlayerHeir) {
    crownSize = PLAYER_HEIR_CROWN_SIZE;
    highlightColor = PLAYER_HEIR_HIGHLIGHT_COLOR;
  } else if (isPlayer) {
    crownSize = PLAYER_CROWN_SIZE;
    highlightColor = PLAYER_HIGHLIGHT_COLOR;
  } else if (isPlayerChild) {
    crownSize = PLAYER_CHILD_CROWN_SIZE;
    highlightColor = PLAYER_CHILD_HIGHLIGHT_COLOR;
  } else if (isPlayerParent) {
    crownSize = PLAYER_PARENT_CROWN_SIZE;
    highlightColor = PLAYER_PARENT_HIGHLIGHT_COLOR;
  } else if (isPlayerPartner) {
    crownSize = PLAYER_PARTNER_CROWN_SIZE; // Partners also get a crown
    highlightColor = PLAYER_PARTNER_HIGHLIGHT_COLOR;
  }

  if (crownSize && highlightColor) {
    drawCrown(ctx, position, currentCharacterRadius, crownSize, highlightColor);
  }

  if (human.tribeBadge) {
    drawTribeBadge(ctx, position, human.tribeBadge, human.isAdult ?? false, crownSize ?? 0);
  }

  const showDebug = isDebugOn && (debugCharacterId === undefined || human.id === debugCharacterId);

  if (showDebug && human.aiBlackboard) {
    renderBehaviorTreeDebug(ctx, human, currentTime);
  }

  renderAttackProgress(ctx, human, currentTime);

  if (showDebug) {
    renderDebugInfo(ctx, human);
  }
}
