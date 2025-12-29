import { Entity } from '../../entities/entities-types';
import { HumanEntity } from '../../entities/characters/human/human-types';
import { UpdateContext, AutopilotControls } from '../../world-types';
import { Blackboard, BlackboardData } from '../behavior-tree/behavior-tree-blackboard';
import { Task, TaskDefinition, TaskResult, TaskType, TaskHistoryEntry } from './task-types';
import { TASK_DISTANCE_SCORE_BASE } from './task-consts';

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

/**
 * Calculates a normalized score (0 to 1) based on distance.
 * Closer distance results in a higher score.
 */
export function getDistanceScore(distance: number): number {
  return 1 / (1 + distance / TASK_DISTANCE_SCORE_BASE);
}

/**
 * A wrapper for defining human tasks that standardizes common checks.
 * Handles isAdult and autopilot behavior checks automatically.
 */
export function defineHumanTask<T extends HumanEntity>(options: {
  type: TaskType;
  requireAdult?: boolean;
  autopilotBehavior?: keyof AutopilotControls['behaviors'];
  producer?: (entity: T, context: UpdateContext) => Record<string, Task>;
  scorer?: (entity: T, task: Task, context: UpdateContext) => number | null;
  executor?: (task: Task, entity: T, context: UpdateContext) => TaskResult;
}): TaskDefinition<T> {
  const { type, requireAdult, autopilotBehavior, producer, scorer, executor } = options;

  const wrappedScorer = scorer
    ? (entity: T, task: Task, context: UpdateContext): number | null => {
        if (requireAdult && !entity.isAdult) {
          return null;
        }

        if (autopilotBehavior && entity.isPlayer && !context.gameState.autopilotControls.behaviors[autopilotBehavior]) {
          return null;
        }

        return scorer(entity, task, context);
      }
    : undefined;

  const wrappedExecutor = executor
    ? (task: Task, entity: T, context: UpdateContext): TaskResult => {
        if (requireAdult && !entity.isAdult) {
          return TaskResult.Failure;
        }

        if (autopilotBehavior && entity.isPlayer && !context.gameState.autopilotControls.behaviors[autopilotBehavior]) {
          return TaskResult.Failure;
        }

        return executor(task, entity, context);
      }
    : undefined;

  return {
    type,
    producer,
    scorer: wrappedScorer,
    executor: wrappedExecutor,
  };
}
