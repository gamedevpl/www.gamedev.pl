import { HUMAN_AI_HUNGER_THRESHOLD_FOR_EATING } from '../../../../ai-consts';
import { HumanEntity } from '../../../../entities/characters/human/human-types';
import { HUMAN_HUNGER_DEATH } from '../../../../human-consts';
import { TASK_DEFAULT_VALIDITY_DURATION } from '../../task-consts';
import { Task, TaskResult, TaskType } from '../../task-types';
import { defineHumanTask } from '../../task-utils';

export const humanEatDefinition = defineHumanTask<HumanEntity>({
  type: TaskType.HumanEat,
  requireAdult: false,
  producer: (human, context) => {
    const tasks: Record<string, Task> = {};

    if (human.hunger > HUMAN_AI_HUNGER_THRESHOLD_FOR_EATING && human.food.length > 0) {
      // Create an Eat task
      const eatTaskId = `eat-task-${human.id}`;
      tasks[eatTaskId] = {
        id: eatTaskId,
        type: TaskType.HumanEat,
        creatorEntityId: human.id,
        target: human.id,
        validUntilTime: context.gameState.time + TASK_DEFAULT_VALIDITY_DURATION,
      };
    }

    return tasks;
  },
  scorer: (human, task) => {
    if (task.target !== human.id) {
      return null;
    }
    if (human.food.length === 0) {
      return null;
    }
    return human.hunger / HUMAN_HUNGER_DEATH;
  },
  executor: (task, human) => {
    if (task.target !== human.id) {
      return TaskResult.Empty;
    }
    if (human.hunger < HUMAN_AI_HUNGER_THRESHOLD_FOR_EATING) {
      return TaskResult.Success;
    }
    if (human.food.length === 0) {
      return TaskResult.Failure;
    }

    human.direction = { x: 0, y: 0 };
    human.target = undefined;
    human.activeAction = 'eating';
    return TaskResult.Running;
  },
});
