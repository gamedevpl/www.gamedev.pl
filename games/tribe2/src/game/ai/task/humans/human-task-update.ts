import { HumanEntity } from '../../../entities/characters/human/human-types';
import { UpdateContext } from '../../../world-types';
import { TaskType } from '../task-types';
import { executeTask, getCurrentTask, produceEntityTasks, setCurrentTask } from '../task-utils';
import { humanTaskDefinitions } from './definitions';

export function updateHumanTaskAI(human: HumanEntity, context: UpdateContext): void {
  // 1. Manual Control Override
  if (human.isPlayer && context.gameState.autopilotControls.isManuallyMoving) {
    const currentTaskId = getCurrentTask(human);
    if (currentTaskId) {
      const task = context.gameState.tasks[currentTaskId];
      if (task && task.claimedByEntityId === human.id) {
        task.claimedByEntityId = undefined;
      }
      setCurrentTask(human, null);
    }
    return;
  }

  produceEntityTasks<HumanEntity>(human, context, Object.values(humanTaskDefinitions));

  let currentTaskId = getCurrentTask(human);

  // Validate current task still exists and hasn't been claimed by someone else (unlikely but safe)
  if (currentTaskId) {
    const task = context.gameState.tasks[currentTaskId];
    if (!task || (task.claimedByEntityId && task.claimedByEntityId !== human.id)) {
      setCurrentTask(human, null);
      currentTaskId = null;
    }
  }

  // 2. Task Interruption / Picking
  const bestTaskId = pickTaskForHuman(human, context);
  if (bestTaskId && bestTaskId !== currentTaskId) {
    const bestTask = context.gameState.tasks[bestTaskId];
    // Interrupt if no current task OR if the new task is a high-priority player command
    if (!currentTaskId || (bestTask && bestTask.type === TaskType.HumanPlayerCommand)) {
      // Unclaim old task
      if (currentTaskId) {
        const oldTask = context.gameState.tasks[currentTaskId];
        if (oldTask && oldTask.claimedByEntityId === human.id) {
          oldTask.claimedByEntityId = undefined;
        }
      }

      // Claim new task
      currentTaskId = bestTaskId;
      setCurrentTask(human, currentTaskId);
      if (bestTask) {
        bestTask.claimedByEntityId = human.id;
      }
    }
  }

  // Execute current task
  if (currentTaskId) {
    const task = context.gameState.tasks[currentTaskId];
    if (task) {
      executeTask(human, task, context, humanTaskDefinitions);
    } else {
      setCurrentTask(human, null);
    }
  }

  if (!getCurrentTask(human)) {
    // No current task assigned
    human.activeAction = 'idle';
  }
}

function pickTaskForHuman(human: HumanEntity, context: UpdateContext): string | null {
  let bestTaskId: string | null = null;
  let bestScore = -Infinity;

  for (const task of Object.values(context.gameState.tasks)) {
    if (task.validUntilTime < context.gameState.time) {
      delete context.gameState.tasks[task.id];
      continue;
    }

    // Skip tasks already claimed by others
    if (task.claimedByEntityId && task.claimedByEntityId !== human.id) {
      continue;
    }

    const definition = humanTaskDefinitions[task.type];
    if (!definition || !definition.scorer) {
      continue;
    }

    const score = definition.scorer(human, task, context);
    if (score !== null && score > bestScore) {
      bestScore = score;
      bestTaskId = task.id;
    }
  }

  // Only return if we found a positive utility task
  return bestScore > 0 ? bestTaskId : null;
}
