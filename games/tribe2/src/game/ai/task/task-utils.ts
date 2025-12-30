import { Entity } from '../../entities/entities-types';
import { UpdateContext, GameWorldState } from '../../world-types';
import { Blackboard, BlackboardData } from '../behavior-tree/behavior-tree-blackboard';
import { Task, TaskDefinition, TaskResult, TaskType, TaskHistoryEntry } from './task-types';
import { TASK_DEFAULT_VALIDITY_DURATION, TASK_DISTANCE_SCORE_BASE } from './task-consts';

export const BLACKBOARD_TASK_ID = 'currentAiTask';
export const BLACKBOARD_LAST_TASK_RESULT = 'lastTaskResult';
export const BLACKBOARD_LAST_TASK_MESSAGE = 'lastTaskMessage';
export const BLACKBOARD_TASK_HISTORY = 'taskHistory';

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

/**
 * Cleans up tasks that have expired based on the current game time.
 */
export function cleanupExpiredTasks(gameState: GameWorldState): void {
  for (const taskId in gameState.tasks) {
    if (gameState.tasks[taskId].validUntilTime < gameState.time) {
      delete gameState.tasks[taskId];
    }
  }
}

/**
 * Unpacks a task result that might be a simple TaskResult enum or a tuple containing
 * the status, an optional message, and an optional next task for chaining.
 */
export function unpackTaskResult(result: [TaskResult, string?, Task?] | TaskResult): [TaskResult, string, Task?] {
  if (Array.isArray(result)) {
    return [result[0], result[1] ?? '', result[2]];
  }
  return [result, '', undefined];
}

export function executeTask<T extends Entity>(
  entity: T & { aiBlackboard: BlackboardData },
  task: Task,
  context: UpdateContext,
  definitions: Record<TaskType, TaskDefinition<T>>,
): TaskResult | undefined {
  const definition = task.type === TaskType.Wait ? waitTask : definitions[task.type];
  let executionResult: [TaskResult, string?, Task?] | TaskResult | undefined;

  if (definition && definition.executor) {
    executionResult = definition.executor(task, entity, context);
  } else {
    executionResult = TaskResult.Failure;
  }

  const [result, message, nextTaskFromResult] = unpackTaskResult(executionResult);

  // Store result and message for debugging
  Blackboard.set(entity.aiBlackboard, BLACKBOARD_LAST_TASK_RESULT, result);
  Blackboard.set(entity.aiBlackboard, BLACKBOARD_LAST_TASK_MESSAGE, message);

  if (result !== TaskResult.Running) {
    // Record history
    const history = Blackboard.get<TaskHistoryEntry[]>(entity.aiBlackboard, BLACKBOARD_TASK_HISTORY) || [];
    history.unshift({ type: task.type, result, completedAtTick: context.gameState.time, message });
    if (history.length > 5) history.pop();
    Blackboard.set(entity.aiBlackboard, BLACKBOARD_TASK_HISTORY, history);

    delete context.gameState.tasks[task.id];
    setCurrentTask(entity, null);

    // Handle Task Chaining
    if (result === TaskResult.Success) {
      const nextTask = nextTaskFromResult || task.nextTask;
      if (nextTask) {
        // Register the next task in the world
        context.gameState.tasks[nextTask.id] = nextTask;
        // Assign it to the current entity
        nextTask.claimedByEntityId = entity.id;
        // Set it as the current task for the next tick
        setCurrentTask(entity, nextTask.id);
      }
    }
  }

  return result;
}

/**
 * Calculates a normalized score (0 to 1) based on distance.
 * Closer distance results in a higher score.
 */
export function getDistanceScore(distance: number): number {
  return 1 / (1 + distance / TASK_DISTANCE_SCORE_BASE);
}

export function produceEntityTasks<T extends Entity>(
  entity: T,
  context: UpdateContext,
  taskDefiniitions: TaskDefinition<T>[],
): void {
  for (let i = 0; i < taskDefiniitions.length; i++) {
    const definition = taskDefiniitions[i];
    if (!definition.producer) {
      continue;
    }
    const newTasks = definition.producer(entity, context);
    for (const taskId in newTasks) {
      const task = newTasks[taskId];
      const currentTask = context.gameState.tasks[taskId];
      context.gameState.tasks[taskId] = task;
      if (currentTask) {
        context.gameState.tasks[taskId].claimedByEntityId = currentTask.claimedByEntityId;
      }
    }
  }
}

export const getWaitTask = (entity: Entity, currentTime: number): Task => ({
  id: `wait-${entity.id}`,
  position: entity.position,
  type: TaskType.Wait,
  creatorEntityId: entity.id,
  validUntilTime: currentTime + TASK_DEFAULT_VALIDITY_DURATION,
});

export const waitTask: TaskDefinition<Entity> = {
  type: TaskType.Wait,
  executor: (task: Task, _entity: Entity, context: UpdateContext): TaskResult | [TaskResult, string] => {
    if (context.gameState.time >= task.validUntilTime - 1) {
      return [TaskResult.Success, 'Wait complete'];
    }
    return [TaskResult.Running, 'Waiting'];
  },
};
