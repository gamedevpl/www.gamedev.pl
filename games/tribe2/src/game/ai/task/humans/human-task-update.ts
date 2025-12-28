import { HumanEntity } from '../../../entities/characters/human/human-types';
import { UpdateContext } from '../../../world-types';
import { executeTask, getCurrentTask, setCurrentTask } from '../task-utils';
import { humanTaskDefinitions } from './definitions';

export function updateHumanTaskAI(human: HumanEntity, context: UpdateContext): void {
  produceHumanTasks(human, context);

  let currentTaskId = getCurrentTask(human);

  // Validate current task still exists and hasn't been claimed by someone else (unlikely but safe)
  if (currentTaskId) {
    const task = context.gameState.tasks[currentTaskId];
    if (!task || (task.claimedByEntityId && task.claimedByEntityId !== human.id)) {
      setCurrentTask(human, null);
      currentTaskId = null;
    }
  }

  // Try to pick a new task if idle
  if (!currentTaskId) {
    currentTaskId = pickTaskForHuman(human, context);
    if (currentTaskId) {
      setCurrentTask(human, currentTaskId);
      // Mark as claimed
      const task = context.gameState.tasks[currentTaskId];
      if (task) {
        task.claimedByEntityId = human.id;
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

function produceHumanTasks(human: HumanEntity, context: UpdateContext): void {
  for (const definition of Object.values(humanTaskDefinitions)) {
    if (definition.producer) {
      const tasks = definition.producer(human, context);
      for (const [taskId, task] of Object.entries(tasks)) {
        // Human-produced tasks are often self-targeted, but we put them in the global pool
        if (!context.gameState.tasks[taskId]) {
          context.gameState.tasks[taskId] = task;
        }
      }
    }
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
