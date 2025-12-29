import { CorpseEntity } from '../../../entities/characters/corpse-types';
import { UpdateContext } from '../../../world-types';
import { produceEntityTasks } from '../task-utils';
import { corpseTaskDefinitions } from './definitions';

/**
 * Updates task production for a corpse entity.
 * Iterates through all corpse task definitions and allows the entity to produce tasks
 * if a producer is defined for that task type.
 */
export function updateCorpseTaskAI(entity: CorpseEntity, context: UpdateContext): void {
  produceEntityTasks<CorpseEntity>(entity, context, Object.values(corpseTaskDefinitions));
}
