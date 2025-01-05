import { UpdateContext } from '../game-world-types';
import { interactionsDefinitions } from '.';

export function interactionsUpdate(updateContext: UpdateContext): void {
  updateContext.gameState.entities.entities.forEach((source) => {
    updateContext.gameState.entities.entities.forEach((target) => {
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
