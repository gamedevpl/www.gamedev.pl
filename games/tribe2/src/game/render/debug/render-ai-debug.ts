import { AIType } from '../../ai/ai-types';
import { CharacterEntity } from '../../entities/characters/character-types';
import { GameWorldState } from '../../world-types';
import { renderBehaviorTreeDebugger } from '../render-ui';
import { renderTaskAiDebugger } from './render-task-ai-debug';
import { UIButtonActionType } from '../../ui/ui-types';
import { UI_FONT_SIZE, UI_PADDING } from '../../ui/ui-consts';

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
      renderTaskAiDebugger(ctx, gameState, width, height);
      break;
    case AIType.BehaviorTreeBased:
      renderBehaviorTreeDebugger(ctx, gameState, width, height);
      break;
    default:
      break;
  }

  // Render AI Type Switch Button
  const panelWidth = 500;
  const panelX = width - panelWidth - 10;
  const panelY = UI_PADDING + UI_FONT_SIZE * 2;

  const buttonWidth = 150;
  const buttonHeight = 25;
  const buttonX = panelX + panelWidth - buttonWidth - 15;
  const buttonY = panelY + 15;

  const buttonRect = { x: buttonX, y: buttonY, width: buttonWidth, height: buttonHeight };

  gameState.uiButtons.push({
    id: 'switch-ai-type-button',
    action: UIButtonActionType.SwitchAIType,
    rect: buttonRect,
    text: '',
    currentWidth: buttonWidth,
    backgroundColor: 'rgba(100, 100, 100, 0.5)',
    textColor: 'white',
  });

  ctx.save();
  ctx.fillStyle = 'rgba(100, 100, 100, 0.8)';
  ctx.fillRect(buttonX, buttonY, buttonWidth, buttonHeight);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1;
  ctx.strokeRect(buttonX, buttonY, buttonWidth, buttonHeight);

  ctx.fillStyle = 'white';
  ctx.font = '10px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const aiTypeLabel = debugCharacter.aiType === AIType.BehaviorTreeBased ? 'BT' : 'Task';
  ctx.fillText(`AI: ${aiTypeLabel} (Switch)`, buttonX + buttonWidth / 2, buttonY + buttonHeight / 2);
  ctx.restore();
}
