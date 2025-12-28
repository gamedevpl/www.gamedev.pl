import { CorpseEntity } from '../../../../entities/characters/corpse-types';
import { TaskDefinition, TaskType } from '../../task-types';
import { corpseGatherProducer } from './corpse-task-gather';

export const corpseTaskDefinitions: Record<TaskType, TaskDefinition<CorpseEntity>> = [
  corpseGatherProducer,
].reduce<Record<TaskType, TaskDefinition<CorpseEntity>>>((acc, def) => {
  acc[def.type] = def;
  return acc;
}, {} as Record<TaskType, TaskDefinition<CorpseEntity>>);
