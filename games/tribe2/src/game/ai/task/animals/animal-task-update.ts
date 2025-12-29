import { PredatorEntity } from '../../../entities/characters/predator/predator-types';
import { PreyEntity } from '../../../entities/characters/prey/prey-types';
import { UpdateContext } from '../../../world-types';
import { animalTaskDefinitions } from './definitions';
import { produceEntityTasks } from '../task-utils';

export function updateAnimalTaskAI(entity: PreyEntity | PredatorEntity, context: UpdateContext): void {
  produceEntityTasks<PreyEntity | PredatorEntity>(entity, context, Object.values(animalTaskDefinitions));
}
