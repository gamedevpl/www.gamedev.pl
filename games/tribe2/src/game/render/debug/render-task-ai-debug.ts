import { CharacterEntity } from '../../entities/characters/character-types';
import { GameWorldState } from '../../world-types';
import { UI_FONT_SIZE, UI_PADDING } from '../../ui/ui-consts';
import {
  getCurrentTask,
  BLACKBOARD_LAST_TASK_RESULT,
  BLACKBOARD_LAST_TASK_MESSAGE,
  BLACKBOARD_TASK_HISTORY,
} from '../../ai/task/task-utils';
import { TaskResult, TaskType, TaskHistoryEntry } from '../../ai/task/task-types';
import { humanTaskDefinitions } from '../../ai/task/humans/definitions';
import { Blackboard } from '../../ai/behavior-tree/behavior-tree-blackboard';
import { HumanEntity } from '../../entities/characters/human/human-types';
import { Vector2D } from '../../utils/math-types';
import { IndexedWorldState } from '../../world-index/world-index-types';

// Style constants
const UI_TASK_DEBUG_FONT_SIZE = 12;
const UI_TASK_DEBUG_LINE_HEIGHT = 16;
const UI_TASK_DEBUG_INDENT_SIZE = 15;

function getTaskResultColor(status: TaskResult | undefined): string {
  switch (status) {
    case TaskResult.Success:
      return '#4CAF50'; // Green
    case TaskResult.Failure:
      return '#F44336'; // Red
    case TaskResult.Running:
      return '#FFC107'; // Yellow
    case TaskResult.Empty:
      return '#9E9E9E'; // Grey
    default:
      return '#FFFFFF'; // White
  }
}

function formatTarget(target: unknown): string {
  if (target === undefined || target === null) return 'None';
  if (typeof target === 'number') return `Entity #${target}`;
  if (typeof target === 'string') return `Task #${target}`;
  if (typeof target === 'object' && 'x' in target && 'y' in target) {
    const pos = target as Vector2D;
    return `Pos(${pos.x.toFixed(0)}, ${pos.y.toFixed(0)})`;
  }
  return JSON.stringify(target);
}

export function renderTaskAiDebugger(
  ctx: CanvasRenderingContext2D,
  gameState: GameWorldState,
  canvasWidth: number,
  canvasHeight: number,
): void {
  const { debugCharacterId } = gameState;

  // Panel setup
  const panelWidth = 500;
  const panelHeight = Math.min(canvasHeight * 0.9, 800);
  const panelX = canvasWidth - panelWidth - 10;
  const panelY = UI_PADDING + UI_FONT_SIZE * 2;

  gameState.debugPanelRect = { x: panelX, y: panelY, width: panelWidth, height: panelHeight };

  ctx.save();

  // Panel background and border
  ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
  ctx.fillRect(panelX, panelY, panelWidth, panelHeight);
  ctx.strokeStyle = '#444';
  ctx.lineWidth = 2;
  ctx.strokeRect(panelX, panelY, panelWidth, panelHeight);

  ctx.fillStyle = 'white';
  ctx.font = `${UI_TASK_DEBUG_FONT_SIZE}px monospace`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  let currentY = panelY + 20;
  const leftMargin = panelX + 15;

  // Title
  ctx.fillStyle = '#66ccff';
  ctx.font = `bold ${UI_TASK_DEBUG_FONT_SIZE + 2}px monospace`;
  ctx.fillText('🤖 Task AI Debugger', leftMargin, currentY);
  currentY += 25;

  if (!debugCharacterId) {
    ctx.fillStyle = '#888';
    ctx.font = `${UI_TASK_DEBUG_FONT_SIZE}px monospace`;
    ctx.fillText('No character selected for debugging.', leftMargin, currentY);
    ctx.fillText('Click on a character to inspect their Task AI.', leftMargin, currentY + 20);
    ctx.restore();
    return;
  }

  const character = gameState.entities.entities[debugCharacterId] as CharacterEntity | undefined;

  if (!character || (character.type !== 'human' && character.type !== 'predator' && character.type !== 'prey')) {
    ctx.fillStyle = '#ff4444';
    ctx.font = `${UI_TASK_DEBUG_FONT_SIZE}px monospace`;
    ctx.fillText(`Character #${debugCharacterId} not found or not a character.`, leftMargin, currentY);
    ctx.restore();
    return;
  }

  const debuggedEntity = character;

  // Character Info
  ctx.fillStyle = 'white';
  ctx.font = `${UI_TASK_DEBUG_FONT_SIZE}px monospace`;
  ctx.fillText(
    `Character: ${debuggedEntity.type} #${debuggedEntity.id} (${debuggedEntity.age.toFixed(1)}y)`,
    leftMargin,
    currentY,
  );
  currentY += UI_TASK_DEBUG_LINE_HEIGHT * 1.5;

  // --- Current Task Section ---
  ctx.fillStyle = '#66ccff';
  ctx.font = `bold ${UI_TASK_DEBUG_FONT_SIZE}px monospace`;
  ctx.fillText('➡️ Current Task', leftMargin, currentY);
  currentY += UI_TASK_DEBUG_LINE_HEIGHT * 1.5;

  const currentTaskId = getCurrentTask(debuggedEntity);
  const currentTask = currentTaskId ? gameState.tasks[currentTaskId] : null;

  ctx.font = `${UI_TASK_DEBUG_FONT_SIZE}px monospace`;
  if (currentTask) {
    const lastTaskResult = Blackboard.get<TaskResult>(debuggedEntity.aiBlackboard, BLACKBOARD_LAST_TASK_RESULT);
    const lastTaskMessage = Blackboard.get<string>(debuggedEntity.aiBlackboard, BLACKBOARD_LAST_TASK_MESSAGE);
    const statusString = lastTaskResult !== undefined ? TaskResult[lastTaskResult] : 'N/A';

    ctx.fillStyle = 'white';
    ctx.fillText(`ID: ${currentTask.id}`, leftMargin + UI_TASK_DEBUG_INDENT_SIZE, currentY);
    currentY += UI_TASK_DEBUG_LINE_HEIGHT;
    ctx.fillText(`Type: ${TaskType[currentTask.type]}`, leftMargin + UI_TASK_DEBUG_INDENT_SIZE, currentY);
    currentY += UI_TASK_DEBUG_LINE_HEIGHT;
    ctx.fillText(`Target: ${formatTarget(currentTask.target)}`, leftMargin + UI_TASK_DEBUG_INDENT_SIZE, currentY);
    currentY += UI_TASK_DEBUG_LINE_HEIGHT;

    ctx.fillStyle = getTaskResultColor(lastTaskResult);
    ctx.fillText(`Status: ${statusString}`, leftMargin + UI_TASK_DEBUG_INDENT_SIZE, currentY);
    currentY += UI_TASK_DEBUG_LINE_HEIGHT;

    if (lastTaskMessage) {
      ctx.fillStyle = '#aaa';
      ctx.fillText(`Message: ${lastTaskMessage}`, leftMargin + UI_TASK_DEBUG_INDENT_SIZE, currentY);
      currentY += UI_TASK_DEBUG_LINE_HEIGHT;
    }
  } else {
    ctx.fillStyle = '#888';
    ctx.fillText('No active task.', leftMargin + UI_TASK_DEBUG_INDENT_SIZE, currentY);
    currentY += UI_TASK_DEBUG_LINE_HEIGHT;
  }
  currentY += UI_TASK_DEBUG_LINE_HEIGHT;

  // --- Recent Task History Section ---
  ctx.fillStyle = '#66ccff';
  ctx.font = `bold ${UI_TASK_DEBUG_FONT_SIZE}px monospace`;
  ctx.fillText('📜 Recent Task History (Last 5)', leftMargin, currentY);
  currentY += UI_TASK_DEBUG_LINE_HEIGHT * 1.5;

  const taskHistory = Blackboard.get<TaskHistoryEntry[]>(debuggedEntity.aiBlackboard, BLACKBOARD_TASK_HISTORY) || [];

  if (taskHistory.length === 0) {
    ctx.fillStyle = '#888';
    ctx.font = `${UI_TASK_DEBUG_FONT_SIZE}px monospace`;
    ctx.fillText('No task history yet.', leftMargin + UI_TASK_DEBUG_INDENT_SIZE, currentY);
    currentY += UI_TASK_DEBUG_LINE_HEIGHT;
  } else {
    for (const entry of taskHistory) {
      ctx.fillStyle = 'white';
      ctx.font = `${UI_TASK_DEBUG_FONT_SIZE}px monospace`;
      const typeText = TaskType[entry.type];
      ctx.fillText(`• ${typeText}`, leftMargin + UI_TASK_DEBUG_INDENT_SIZE, currentY);

      const resultText = TaskResult[entry.result];
      ctx.fillStyle = getTaskResultColor(entry.result);
      const typeWidth = ctx.measureText(`• ${typeText} `).width;
      ctx.fillText(`(${resultText})`, leftMargin + UI_TASK_DEBUG_INDENT_SIZE + typeWidth, currentY);

      ctx.fillStyle = '#666';
      const resultWidth = ctx.measureText(`(${resultText}) `).width;
      ctx.fillText(
        `@ ${entry.completedAtTick.toFixed(1)}h`,
        leftMargin + UI_TASK_DEBUG_INDENT_SIZE + typeWidth + resultWidth,
        currentY,
      );

      currentY += UI_TASK_DEBUG_LINE_HEIGHT;

      if (entry.message) {
        ctx.fillStyle = '#888';
        ctx.fillText(`  └ ${entry.message}`, leftMargin + UI_TASK_DEBUG_INDENT_SIZE, currentY);
        currentY += UI_TASK_DEBUG_LINE_HEIGHT;
      }
    }
  }
  currentY += UI_TASK_DEBUG_LINE_HEIGHT;

  // --- Available Tasks Section ---
  ctx.fillStyle = '#66ccff';
  ctx.font = `bold ${UI_TASK_DEBUG_FONT_SIZE}px monospace`;
  ctx.fillText('📋 Available Tasks', leftMargin, currentY);
  currentY += UI_TASK_DEBUG_LINE_HEIGHT * 1.5;

  const contentStartY = currentY;
  const contentHeight = panelY + panelHeight - contentStartY - 30;

  ctx.save();
  ctx.beginPath();
  ctx.rect(panelX, contentStartY, panelWidth, contentHeight);
  ctx.clip();

  const scrollY = gameState.debugPanelScroll?.y ?? 0;
  ctx.translate(0, -scrollY);

  const allTasks = (gameState as IndexedWorldState).search.tasks.byRadius(character.position, 800);
  let maxContentWidth = 0;

  if (allTasks.length === 0) {
    ctx.fillStyle = '#888';
    ctx.font = `${UI_TASK_DEBUG_FONT_SIZE}px monospace`;
    ctx.fillText('No tasks available in the world.', leftMargin + UI_TASK_DEBUG_INDENT_SIZE, currentY);
    currentY += UI_TASK_DEBUG_LINE_HEIGHT;
  } else {
    const allTasksScored = allTasks.map((task) => {
      const definition = humanTaskDefinitions[task.type];
      // Note: We currently only have humanTaskDefinitions.
      // Animals use a different task system but we can still show scores if they were humans.
      // For actual animal task debugging, we'd need animalTaskDefinitions here.
      return {
        task,
        score:
          definition && definition.scorer && debuggedEntity.type === 'human'
            ? definition.scorer(debuggedEntity as HumanEntity, task, { gameState, deltaTime: 0 })
            : null,
      };
    });
    allTasksScored.sort((a, b) => {
      const scoreA = a.score !== null ? a.score : -Infinity;
      const scoreB = b.score !== null ? b.score : -Infinity;
      return scoreB - scoreA;
    });
    for (const { task, score } of allTasksScored) {
      let claimStatus = 'Unclaimed';
      let claimColor = '#888';
      if (task.claimedByEntityId) {
        if (task.claimedByEntityId === debuggedEntity.id) {
          claimStatus = 'Claimed by this character';
          claimColor = '#4CAF50';
        } else {
          claimStatus = `Claimed by #${task.claimedByEntityId}`;
          claimColor = '#F44336';
        }
      }

      ctx.font = `${UI_TASK_DEBUG_FONT_SIZE}px monospace`;
      ctx.fillStyle = claimColor;
      const idText = `● Task ID: ${task.id}`;
      ctx.fillText(idText, leftMargin, currentY);
      currentY += UI_TASK_DEBUG_LINE_HEIGHT;

      ctx.fillStyle = 'white';
      ctx.fillText(`  Type: ${TaskType[task.type]}`, leftMargin, currentY);
      currentY += UI_TASK_DEBUG_LINE_HEIGHT;

      const scoreString = score !== null ? score.toFixed(3) : 'N/A';
      ctx.fillStyle = score !== null && score > 0 ? '#FFC107' : '#888';
      ctx.fillText(`  Score: ${scoreString}`, leftMargin, currentY);
      currentY += UI_TASK_DEBUG_LINE_HEIGHT;

      ctx.fillStyle = claimColor;
      ctx.fillText(`  Status: ${claimStatus}`, leftMargin, currentY);
      currentY += UI_TASK_DEBUG_LINE_HEIGHT * 1.5;

      // Simple width tracking for scroll clamping
      maxContentWidth = Math.max(maxContentWidth, ctx.measureText(idText).width + 30);
    }
  }

  const totalContentHeight = currentY - contentStartY;
  gameState.debugPanelContentSize = { width: maxContentWidth, height: totalContentHeight };

  ctx.restore();

  const footerY = panelY + panelHeight - 15;
  ctx.fillStyle = '#888';
  ctx.font = '10px monospace';
  ctx.textAlign = 'center';
  ctx.fillText("Press 'Shift + ~' to toggle this debugger", panelX + panelWidth / 2, footerY);

  ctx.restore();
}
