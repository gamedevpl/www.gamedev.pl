import { BerryBushEntity } from '../../../../entities/plants/berry-bush/berry-bush-types';
import { TaskDefinition, TaskType } from '../../task-types';
import { berryBushGatherProducer } from './berry-bush-task-gather';

export const plantTaskDefinitions: Record<TaskType, TaskDefinition<BerryBushEntity>> = [berryBushGatherProducer].reduce<
  Record<TaskType, TaskDefinition<BerryBushEntity>>
>((acc, def) => {
  acc[def.type] = def;
  return acc;
}, {} as Record<TaskType, TaskDefinition<BerryBushEntity>>);
