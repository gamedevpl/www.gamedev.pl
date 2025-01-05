import { GameWorldState, UpdateContext } from '../game-world-types';
import { interactionsDefinitions } from '.';

export function interactionsUpdate(gameState: GameWorldState, updateContext: UpdateContext): void {
  gameState.entities.entities.forEach((source) => {
    gameState.entities.entities.forEach((target) => {
      if (source === target) {
        return;
      }

      interactionsDefinitions.forEach((interaction) => {
        if (
          (!interaction.sourceType || source.type === interaction.sourceType) &&
          (!interaction.targetType || target.type === interaction.targetType) &&
          interaction.checker(source, target, updateContext)
        ) {
          interaction.perform(source, target, updateContext);
        }
      });
    });
  });
}
