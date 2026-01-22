import { HumanEntity } from '../../../entities/characters/human/human-types';
import { UpdateContext } from '../../../world-types';
import { TASK_DEFAULT_VALIDITY_DURATION } from '../task-consts';
import { TaskType, Task, TaskResult, TaskDefinition } from '../task-types';
import { getStrategicModifier } from '../strategic-objective-modifiers';

/**
 * A wrapper for defining human tasks that standardizes common checks.
 * Handles isAdult and autopilot behavior checks automatically.
 * Also applies strategic objective modifiers to task scores.
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

        const baseScore = scorer(entity, task, context);
        if (baseScore === null) {
          return null;
        }

        // Apply strategic objective modifier from the tribe leader
        const leader = entity.leaderId
          ? (context.gameState.entities.entities[entity.leaderId] as HumanEntity | undefined)
          : undefined;
        const strategicObjective = leader?.tribeControl?.strategicObjective;
        const modifier = getStrategicModifier(strategicObjective, task.type);

        return baseScore * modifier;
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
