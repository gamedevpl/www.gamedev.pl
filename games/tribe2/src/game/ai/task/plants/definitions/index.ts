import { PlantEntity } from '../../../../entities/plants/plant-types';
import { TaskDefinition, TaskType } from '../../task-types';
import { berryBushGatherProducer } from './berry-bush-task-gather';
import { treeChopProducer } from './tree-task-chop';
import { treeGatherWoodProducer } from './tree-task-gather-wood';

export const plantTaskDefinitions: Record<TaskType, TaskDefinition<PlantEntity>> = [
  berryBushGatherProducer,
  treeChopProducer,
  treeGatherWoodProducer,
].reduce<Record<TaskType, TaskDefinition<PlantEntity>>>((acc, def) => {
  acc[def.type] = def as TaskDefinition<PlantEntity>;
  return acc;
}, {} as Record<TaskType, TaskDefinition<PlantEntity>>);
