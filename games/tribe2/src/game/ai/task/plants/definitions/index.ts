import { TaskDefinition, TaskType } from '../../task-types';
import { berryBushGatherProducer } from './berry-bush-task-gather';
import { treeChopProducer } from './tree-task-chop';
import { treeGatherWoodProducer } from './tree-task-gather-wood';

export const plantTaskDefinitions: Record<TaskType, TaskDefinition<any>> = [
  berryBushGatherProducer,
  treeChopProducer,
  treeGatherWoodProducer,
].reduce<Record<TaskType, TaskDefinition<any>>>((acc, def) => {
  acc[def.type] = def;
  return acc;
}, {} as Record<TaskType, TaskDefinition<any>>);
