import { agenticDefinitions } from './agentic-definitions';
import { GameState, UpdateContext } from './game-world-types';

export function agenticUpdate(gameState: GameState, updateContext: UpdateContext) {
  gameState.entities.entities.forEach((entity) => {
    const behavior = agenticDefinitions.find((definition) => definition.entityType === entity.type);
    if (behavior) {
      behavior.perform(gameState, entity, updateContext);
    }
  });
}
