import { HUMAN_AI_HUNGER_THRESHOLD_FOR_EATING } from '../../../../ai-consts';
import { HumanEntity } from '../../../../entities/characters/human/human-types';
import { HUMAN_HUNGER_DEATH } from '../../../../human-consts';
import { Task, TaskDefinition, TaskResult, TaskType } from '../../task-types';

export const humanEatDefinition: TaskDefinition<HumanEntity> = {
  type: TaskType.HumanEat,
  producer: (human: HumanEntity) => {
    const tasks: Record<string, Task> = {};

    if (human.hunger > HUMAN_AI_HUNGER_THRESHOLD_FOR_EATING && human.food.length > 0) {
      // Create an Eat task
      const eatTaskId = `eat-task-${human.id}`;
      tasks[eatTaskId] = {
        id: eatTaskId,
        type: TaskType.HumanEat,
        creatorEntityId: human.id,
        target: human.id,
      };
    }

    return tasks;
  },
  scorer: (human: HumanEntity) => {
    return 1 - human.hunger / HUMAN_HUNGER_DEATH;
  },
  executor: (task, human) => {
    if (task.target !== human.id) {
      return TaskResult.Empty;
    }
    if (human.food.length === 0) {
      return TaskResult.Failure;
    }
    if (human.food.length > 0 && human.hunger > HUMAN_AI_HUNGER_THRESHOLD_FOR_EATING) {
      human.direction = { x: 0, y: 0 };
      human.target = undefined;
      human.activeAction = 'eating';
      return TaskResult.Running;
    }
    return TaskResult.Success;
  },
};
