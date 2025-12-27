import { HumanEntity } from '../../../entities/characters/human/human-types';
import { UpdateContext } from '../../../world-types';
import { executeTask, getCurrentTask, setCurrentTask } from '../task-utils';
import { humanTaskDefinitions } from './definitions';

export function updateHumanTaskAI(human: HumanEntity, context: UpdateContext): void {
  produceHumanTasks(human, context);
  let currentTaskId = getCurrentTask(human);
  if (!currentTaskId) {
    currentTaskId = pickTaskForHuman(human, context);
    if (currentTaskId) {
      setCurrentTask(human, currentTaskId);
    }
  }
  if (currentTaskId) {
    const task = context.gameState.tasks[currentTaskId];
    if (task) {
      executeTask(human, task, context, humanTaskDefinitions);
    } else {
      setCurrentTask(human, null);
    }
  }

  if (!currentTaskId) {
    // No current task assigned
    human.activeAction = 'idle';
  }
}

function produceHumanTasks(human: HumanEntity, context: UpdateContext): void {
  for (const definition of Object.values(humanTaskDefinitions)) {
    if (definition.producer) {
      const tasks = definition.producer(human, context);
      for (const [taskId, task] of Object.entries(tasks)) {
        context.gameState.tasks[taskId] = task;
      }
    }
  }
}

function pickTaskForHuman(human: HumanEntity, context: UpdateContext): string | null {
  // TODO: Make actual task selection logic here
  for (const task of Object.values(context.gameState.tasks)) {
    if (task.claimedByEntityId === human.id) {
      return task.id;
    }
  }

  return null;
}
