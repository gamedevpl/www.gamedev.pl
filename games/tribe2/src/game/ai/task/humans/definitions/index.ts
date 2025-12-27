import { HumanEntity } from '../../../../entities/characters/human/human-types';
import { TaskDefinition, TaskType } from '../../task-types';
import { humanEatDefinition } from './human-task-eat';

export const humanTaskDefinitions = [humanEatDefinition].reduce<Record<TaskType, TaskDefinition<HumanEntity>>>(
  (acc, def) => {
    acc[def.type] = def;
    return acc;
  },
  {} as Record<TaskType, TaskDefinition<HumanEntity>>,
);
