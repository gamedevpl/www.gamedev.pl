import { PredatorEntity } from '../../../../entities/characters/predator/predator-types';
import { PreyEntity } from '../../../../entities/characters/prey/prey-types';
import { TaskDefinition, TaskType } from '../../task-types';
import { animalHuntPreyProducer } from './animal-task-hunt-prey';
import { animalHuntPredatorProducer } from './animal-task-hunt-predator';

export const animalTaskDefinitions: Partial<Record<TaskType, TaskDefinition<PreyEntity | PredatorEntity>>> = {
  [TaskType.HumanHuntPrey]: {
    type: TaskType.HumanHuntPrey,
    producer: animalHuntPreyProducer as any,
  },
  [TaskType.HumanHuntPredator]: {
    type: TaskType.HumanHuntPredator,
    producer: animalHuntPredatorProducer as any,
  },
};
