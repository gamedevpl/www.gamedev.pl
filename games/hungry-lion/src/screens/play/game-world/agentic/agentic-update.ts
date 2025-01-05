import { agenticDefinitions } from '.';
import { LionEntity, PreyEntity } from '../entities/entities-types';
import { UpdateContext } from '../game-world-types';
import { AgenticBehavior } from './agentic-types';

export function agenticUpdate(updateContext: UpdateContext) {
  updateContext.gameState.entities.entities.forEach((entity) => {
    for (const behavior of agenticDefinitions.filter((definition) => definition.entityType === entity.type)) {
      switch (entity.type) {
        case 'lion':
          (behavior as AgenticBehavior<LionEntity>).perform(entity as LionEntity, updateContext);
          break;
        case 'prey':
          (behavior as AgenticBehavior<PreyEntity>).perform(entity as PreyEntity, updateContext);
          break;
        default:
          break;
      }
    }
  });
}
