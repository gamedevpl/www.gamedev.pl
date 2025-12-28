import { CorpseEntity } from '../../../entities/characters/corpse-types';
import { UpdateContext } from '../../../world-types';
import { corpseTaskDefinitions } from './definitions';

/**
 * Updates task production for a corpse entity.
 * Iterates through all corpse task definitions and allows the entity to produce tasks
 * if a producer is defined for that task type.
 */
export function updateCorpseTaskAI(entity: CorpseEntity, context: UpdateContext): void {
  for (const definition of Object.values(corpseTaskDefinitions)) {
    if (definition.producer) {
      const producedTasks = definition.producer(entity, context);
      for (const [taskId, task] of Object.entries(producedTasks)) {
        // Only add if not already present
        if (!context.gameState.tasks[taskId]) {
          context.gameState.tasks[taskId] = task;
        }
      }
    }
  }
}
