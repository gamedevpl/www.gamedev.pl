import { PredatorEntity } from '../../../../entities/characters/predator/predator-types';
import { PreyEntity } from '../../../../entities/characters/prey/prey-types';
import { TaskDefinition, TaskType } from '../../task-types';
import { animalHuntPreyProducer } from './animal-task-hunt-prey';
import { animalHuntPredatorProducer } from './animal-task-hunt-predator';
import { animalFleeTask } from './animal-task-flee';
import { animalGrazeTask } from './animal-task-graze';
import { animalHuntTask } from './animal-task-hunt';
import { animalProcreateTask } from './animal-task-procreate';
import { animalWanderTask } from './animal-task-wander';
import { animalFeedChildTask } from './animal-task-feed-child';
import { animalSeekFoodTask } from './animal-task-seek-food';
import { animalHerdTask } from './animal-task-herd';
import { animalAttackTask } from './animal-task-attack';
import { animalTerritorialTask } from './animal-task-territorial';
import { animalPackTask } from './animal-task-pack';

export const animalTaskDefinitions = {} as Record<
  TaskType,
  TaskDefinition<PreyEntity> | TaskDefinition<PredatorEntity>
>;

animalTaskDefinitions[TaskType.HumanHuntPrey] = {
  type: TaskType.HumanHuntPrey,
  producer: animalHuntPreyProducer,
};
animalTaskDefinitions[TaskType.HumanHuntPredator] = {
  type: TaskType.HumanHuntPredator,
  producer: animalHuntPredatorProducer,
};
animalTaskDefinitions[TaskType.AnimalFlee] = animalFleeTask;
animalTaskDefinitions[TaskType.AnimalGraze] = animalGrazeTask;
animalTaskDefinitions[TaskType.AnimalHunt] = animalHuntTask;
animalTaskDefinitions[TaskType.AnimalAttack] = animalAttackTask;
animalTaskDefinitions[TaskType.AnimalProcreate] = animalProcreateTask;
animalTaskDefinitions[TaskType.AnimalWander] = animalWanderTask;
animalTaskDefinitions[TaskType.AnimalFeedChild] = animalFeedChildTask;
animalTaskDefinitions[TaskType.AnimalSeekFoodFromParent] = animalSeekFoodTask;
animalTaskDefinitions[TaskType.AnimalHerd] = animalHerdTask;
animalTaskDefinitions[TaskType.AnimalTerritorial] = animalTerritorialTask;
animalTaskDefinitions[TaskType.AnimalPack] = animalPackTask;
