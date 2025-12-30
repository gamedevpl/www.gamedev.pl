import { HumanEntity } from '../../../entities/characters/human/human-types';
import { IndexedWorldState } from '../../../world-index/world-index-types';
import { UpdateContext } from '../../../world-types';
import { executeTask, getCurrentTask, produceEntityTasks, setCurrentTask } from '../task-utils';
import { humanTaskDefinitions, humanTaskDefinitionList } from './definitions';

export function prepareHumanTaskAI(entity: HumanEntity, context: UpdateContext): void {
  produceEntityTasks<HumanEntity>(entity, context, humanTaskDefinitionList);
}

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

  let currentTaskId = getCurrentTask(human);

  // Validate current task still exists and hasn't been claimed by someone else (unlikely but safe)
  if (currentTaskId) {
    const task = context.gameState.tasks[currentTaskId];
    if (!task || (task.claimedByEntityId && task.claimedByEntityId !== human.id)) {
      setCurrentTask(human, null);
      currentTaskId = null;
    }
  }

  // 2. Task Picking
  if (!currentTaskId) {
    const bestTaskId = pickTaskForHuman(human, context);
    // Interrupt if no current task OR if the new task is a high-priority player command
    if (bestTaskId && context.gameState.tasks[bestTaskId]) {
      const bestTask = context.gameState.tasks[bestTaskId];

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
}

function pickTaskForHuman(human: HumanEntity, context: UpdateContext): string | null {
  let bestTaskId: string | null = null;
  let bestScore = -Infinity;

  const closeTasks = (context.gameState as IndexedWorldState).search.tasks.byRadius(human.position, 800);

  for (let task of closeTasks) {
    if (!task) {
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
