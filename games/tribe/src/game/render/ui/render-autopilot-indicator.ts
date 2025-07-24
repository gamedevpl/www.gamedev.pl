import { Entity } from '../../entities/entities-types';
import { PLAYER_ACTION_EMOJIS, PLAYER_ACTION_NAMES, PlayerActionType } from '../../ui/ui-types';
import { Vector2D } from '../../utils/math-types';
import {
  PLAYER_ACTION_HINT_FONT_SIZE,
  PLAYER_ACTION_OUTLINE_COLOR,
  PLAYER_ACTION_OUTLINE_DASH_PATTERN,
  PLAYER_ACTION_OUTLINE_RADIUS_OFFSET,
  UI_TUTORIAL_HIGHLIGHT_PULSE_SPEED,
} from '../../world-consts';
import { GameWorldState } from '../../world-types';

function drawIndicator(
  ctx: CanvasRenderingContext2D,
  position: Vector2D,
  radius: number,
  action: PlayerActionType,
  time: number,
) {
  ctx.save();

  // Pulsing effect for the circle
  const pulse = (Math.sin(time * UI_TUTORIAL_HIGHLIGHT_PULSE_SPEED) + 1) / 2; // a value between 0 and 1
  const circleRadius = radius + PLAYER_ACTION_OUTLINE_RADIUS_OFFSET + pulse * 5;

  // Draw the pulsing circle
  ctx.strokeStyle = PLAYER_ACTION_OUTLINE_COLOR;
  ctx.lineWidth = 2;
  ctx.setLineDash(PLAYER_ACTION_OUTLINE_DASH_PATTERN);
  ctx.beginPath();
  ctx.arc(position.x, position.y, circleRadius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // Draw the emoji and text
  const emoji = PLAYER_ACTION_EMOJIS[action];
  const name = PLAYER_ACTION_NAMES[action];
  if (emoji) {
    ctx.font = `${PLAYER_ACTION_HINT_FONT_SIZE * 1.5}px "Press Start 2P", Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const textY = position.y - circleRadius - 25;
    ctx.fillText(emoji, position.x, textY);
    ctx.font = `${PLAYER_ACTION_HINT_FONT_SIZE * 0.8}px "Press Start 2P", Arial`;
    ctx.fillText(name, position.x, textY + 25);
  }

  ctx.restore();
}

export function renderAutopilotIndicator(ctx: CanvasRenderingContext2D, gameState: GameWorldState): void {
  const activeAction = gameState.autopilotControls.activeAutopilotAction;
  if (!activeAction) {
    return;
  }

  let targetPosition: Vector2D | undefined;
  let targetRadius = 15; // Default radius for position-based actions

  if ('position' in activeAction) {
    targetPosition = activeAction.position;
  } else if ('targetEntityId' in activeAction) {
    // Handles all entity-based actions like Attack, Procreate, FollowMe, etc.
    const targetEntity = gameState.entities.entities.get(activeAction.targetEntityId);
    if (targetEntity) {
      targetPosition = targetEntity.position;
      targetRadius = (targetEntity as Entity).radius || 30;
    }
  }

  if (targetPosition) {
    drawIndicator(ctx, targetPosition, targetRadius, activeAction.action, gameState.time);
  }
}
