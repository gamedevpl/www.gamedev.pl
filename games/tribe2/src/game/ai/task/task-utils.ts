import { Entity } from '../../entities/entities-types';
import { UpdateContext } from '../../world-types';
import { Blackboard, BlackboardData } from '../behavior-tree/behavior-tree-blackboard';
import { Task, TaskDefinition, TaskResult, TaskType } from './task-types';

const BLACKBOARD_TASK_ID = 'currentAiTask';

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
  if (definition) {
    const result = definition.executor(task, entity, context);
    if (result !== TaskResult.Running) {
      delete context.gameState.tasks[task.id];
      setCurrentTask(entity, null);
    }
    return result;
  }
}
