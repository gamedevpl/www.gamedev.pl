import { PreyEntity } from '../entities/characters/prey/prey-types';
import { PredatorEntity } from '../entities/characters/predator/predator-types';
import { UpdateContext } from '../world-types';
import { updateAnimalTaskAI } from './task/animals/animal-task-update';

/**
 * Updates the AI for a prey entity using task-based system.
 */
export function preyAIUpdate(prey: PreyEntity, context: UpdateContext): void {
  updateAnimalTaskAI(prey, context);
}

/**
 * Updates the AI for a predator entity using task-based system.
 */
export function predatorAIUpdate(predator: PredatorEntity, context: UpdateContext): void {
  updateAnimalTaskAI(predator, context);
}
