import { HumanEntity } from '../../../../entities/characters/human/human-types';
import { TaskDefinition, TaskType } from '../../task-types';
import { humanEatDefinition } from './human-task-eat';
import { humanGatherBerriesDefinition } from './human-task-gather-berries';
import { humanGatherMeatDefinition } from './human-task-gather-meat';
import { humanProcreateFemaleDefinition } from './human-task-procreate-female';
import { humanProcreateMaleDefinition } from './human-task-procreate-male';
import { humanFeedChildDefinition } from './human-task-feed-child';

export const humanTaskDefinitions: Record<TaskType, TaskDefinition<HumanEntity>> = [
  humanEatDefinition,
  humanGatherBerriesDefinition,
  humanGatherMeatDefinition,
  humanProcreateFemaleDefinition,
  humanProcreateMaleDefinition,
  humanFeedChildDefinition,
].reduce<Record<TaskType, TaskDefinition<HumanEntity>>>((acc, def) => {
  acc[def.type] = def;
  return acc;
}, {} as Record<TaskType, TaskDefinition<HumanEntity>>);
