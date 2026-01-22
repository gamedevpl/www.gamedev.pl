import { HumanEntity } from '../../../entities/characters/human/human-types';
import { UpdateContext } from '../../../world-types';
import { TASK_DEFAULT_VALIDITY_DURATION } from '../task-consts';
import { TaskType, Task, TaskResult, TaskDefinition } from '../task-types';

/**
 * A wrapper for defining human tasks that standardizes common checks.
 * Handles isAdult and autopilot behavior checks automatically.
 */

export function defineHumanTask<T extends HumanEntity>(options: {
  type: TaskType;
  requireAdult?: boolean;
  producer?: (entity: T, context: UpdateContext) => Record<string, Task>;
  scorer?: (entity: T, task: Task, context: UpdateContext) => number | null;
  executor?: (task: Task, entity: T, context: UpdateContext) => [TaskResult, string?, Task?] | TaskResult;
}): TaskDefinition<T> {
  const { type, requireAdult, producer, scorer, executor } = options;

  const wrappedScorer = scorer
    ? (entity: T, task: Task, context: UpdateContext): number | null => {
        if (requireAdult && !entity.isAdult) {
          return null;
        }

        return scorer(entity, task, context);
      }
    : undefined;

  const wrappedExecutor = executor
    ? (task: Task, entity: T, context: UpdateContext): [TaskResult, string?, Task?] | TaskResult => {
        if (requireAdult && !entity.isAdult) {
          return TaskResult.Failure;
        }

        if (
          context.gameState.autopilotControls.activeAutopilotAction &&
          task.type !== TaskType.HumanPlayerCommand &&
          entity.isPlayer
        ) {
          return [
            TaskResult.Failure,
            'Autopilot action active',
            {
              id: `player-command-${entity.id}`,
              type: TaskType.HumanPlayerCommand,
              position: entity.position,
              creatorEntityId: entity.id,
              validUntilTime: context.gameState.time + TASK_DEFAULT_VALIDITY_DURATION,
            },
          ];
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
