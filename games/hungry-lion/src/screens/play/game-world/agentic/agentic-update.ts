import { agenticDefinitions } from '.';
import { LionEntity, PreyEntity } from '../entities-types';
import { GameWorldState, UpdateContext } from '../game-world-types';
import { AgenticBehavior } from './agentic-types';

export function agenticUpdate(gameState: GameWorldState, updateContext: UpdateContext) {
  gameState.entities.entities.forEach((entity) => {
    for (const behavior of agenticDefinitions.filter((definition) => definition.entityType === entity.type)) {
      switch (entity.type) {
        case 'lion':
          (behavior as AgenticBehavior<LionEntity>).perform(gameState, entity as LionEntity, updateContext);
          break;
        case 'prey':
          (behavior as AgenticBehavior<PreyEntity>).perform(gameState, entity as PreyEntity, updateContext);
          break;
        default:
          break;
      }
    }
  });
}
