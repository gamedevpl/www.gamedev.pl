import { Entity } from '../../entities/entities-types';
import { UpdateContext } from '../../world-types';
import { Blackboard, BlackboardData } from '../behavior-tree/behavior-tree-blackboard';
import { Task, TaskDefinition, TaskResult, TaskType, TaskHistoryEntry } from './task-types';

const BLACKBOARD_TASK_ID = 'currentAiTask';
const BLACKBOARD_LAST_TASK_RESULT = 'lastTaskResult';
const BLACKBOARD_TASK_HISTORY = 'taskHistory';

export function getCurrentTask({ aiBlackboard }: { aiBlackboard: BlackboardData }): string | null {
  return Blackboard.get<string>(aiBlackboard, BLACKBOARD_TASK_ID) || null;
}

export function setCurrentTask({ aiBlackboard }: { aiBlackboard: BlackboardData }, taskId: string | null): void {
  if (taskId) {
    Blackboard.set<string>(aiBlackboard, BLACKBOARD_TASK_ID, taskId);
  } else {
    Blackboard.delete(aiBlackboard, BLACKBOARD_TASK_ID);
  }
}

export function executeTask<T extends Entity>(
  entity: T & { aiBlackboard: BlackboardData },
  task: Task,
  context: UpdateContext,
  definitions: Record<TaskType, TaskDefinition<T>>,
): TaskResult | undefined {
  const definition = definitions[task.type];
  let result: TaskResult | undefined;

  if (definition && definition.executor) {
    result = definition.executor(task, entity, context);
  } else {
    result = TaskResult.Failure;
  }

  // Store result for debugging
  Blackboard.set(entity.aiBlackboard, BLACKBOARD_LAST_TASK_RESULT, result);

  if (result !== TaskResult.Running) {
    // Record history
    const history = Blackboard.get<TaskHistoryEntry[]>(entity.aiBlackboard, BLACKBOARD_TASK_HISTORY) || [];
    history.unshift({ type: task.type, result, completedAtTick: context.gameState.time });
    if (history.length > 5) history.pop();
    Blackboard.set(entity.aiBlackboard, BLACKBOARD_TASK_HISTORY, history);

    delete context.gameState.tasks[task.id];
    setCurrentTask(entity, null);
  }

  return result;
}
