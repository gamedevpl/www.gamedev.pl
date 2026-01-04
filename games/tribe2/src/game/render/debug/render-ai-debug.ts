import { AIType } from '../../ai/ai-types';
import { CharacterEntity } from '../../entities/characters/character-types';
import { GameWorldState } from '../../world-types';
import { renderTaskAiDebugger } from './render-task-ai-debug';

export function renderAiDebugger(
  ctx: CanvasRenderingContext2D,
  gameState: GameWorldState,
  width: number,
  height: number,
): void {
  const { debugCharacterId } = gameState;
  if (!debugCharacterId) {
    return;
  }

  const debugCharacter = gameState.entities.entities[debugCharacterId] as CharacterEntity | undefined;
  if (
    !debugCharacter ||
    (debugCharacter.type !== 'human' && debugCharacter.type !== 'predator' && debugCharacter.type !== 'prey')
  ) {
    return;
  }

  switch (debugCharacter.aiType) {
    case AIType.TaskBased:
    default:
      renderTaskAiDebugger(ctx, gameState, width, height);
      break;
  }
}
