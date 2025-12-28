import { HumanEntity } from '../../../../entities/characters/human/human-types';
import { TaskDefinition, TaskType } from '../../task-types';
import { humanEatDefinition } from './human-task-eat';
import { humanGatherBerriesDefinition } from './human-task-gather-berries';
import { humanGatherMeatDefinition } from './human-task-gather-meat';

export const humanTaskDefinitions: Record<TaskType, TaskDefinition<HumanEntity>> = [
  humanEatDefinition,
  humanGatherBerriesDefinition,
  humanGatherMeatDefinition,
].reduce<Record<TaskType, TaskDefinition<HumanEntity>>>((acc, def) => {
  acc[def.type] = def;
  return acc;
}, {} as Record<TaskType, TaskDefinition<HumanEntity>>);
