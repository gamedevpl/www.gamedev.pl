import { PredatorEntity } from '../../../entities/characters/predator/predator-types';
import { PreyEntity } from '../../../entities/characters/prey/prey-types';
import { UpdateContext } from '../../../world-types';

export function updateAnimalTaskAI(_animal: PreyEntity | PredatorEntity, _context: UpdateContext): void {
  // Future implementation for TaskBased AI for animals can be added here.
}
