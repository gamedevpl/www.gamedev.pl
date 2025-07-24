import { GameWorldState } from '../../world-types';
import {
  PLAYER_ACTION_HINT_FONT_SIZE,
  PLAYER_ACTION_OUTLINE_COLOR,
  PLAYER_ACTION_OUTLINE_DASH_PATTERN,
  PLAYER_ACTION_OUTLINE_RADIUS_OFFSET,
  CHARACTER_RADIUS,
} from '../../world-consts';
import { drawDottedOutline } from './render-player-hints';
import { PLAYER_ACTION_EMOJIS, PLAYER_ACTION_NAMES } from '../../ui/ui-types';
import { Vector2D } from '../../utils/math-types';

export function renderAutopilotHints(
  ctx: CanvasRenderingContext2D,
  gameState: GameWorldState,
  viewportCenter: { x: number; y: number },
  canvasWidth: number,
  canvasHeight: number,
): void {
  const action = gameState.autopilotControls.hoveredAutopilotAction;
  if (!action) {
    return;
  }

  let targetPosition: Vector2D | undefined;
  let targetRadius: number = CHARACTER_RADIUS / 2; // Default radius for position-based hints
  const emoji = PLAYER_ACTION_EMOJIS[action.action];
  const name = PLAYER_ACTION_NAMES[action.action];
  const text = `${emoji} ${name}`;

  if ('targetEntityId' in action) {
    const entity = gameState.entities.entities.get(action.targetEntityId);
    if (entity) {
      targetPosition = entity.position;
      targetRadius = entity.radius;
    }
  } else if ('position' in action) {
    targetPosition = action.position;
  }

  if (targetPosition) {
    // Draw outline
    drawDottedOutline(
      ctx,
      targetPosition,
      targetRadius,
      PLAYER_ACTION_OUTLINE_COLOR,
      PLAYER_ACTION_OUTLINE_DASH_PATTERN,
      2,
      viewportCenter,
      canvasWidth,
      canvasHeight,
    );

    // Render text hint
    ctx.save();
    ctx.font = `${PLAYER_ACTION_HINT_FONT_SIZE}px "Press Start 2P", Arial`;
    ctx.fillStyle = 'white';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.shadowColor = 'black';
    ctx.shadowBlur = 5;

    const targetScreenX = targetPosition.x - viewportCenter.x + canvasWidth / 2;
    const targetScreenY = targetPosition.y - viewportCenter.y + canvasHeight / 2;

    const yOffset =
      targetScreenY - targetRadius - PLAYER_ACTION_OUTLINE_RADIUS_OFFSET - PLAYER_ACTION_HINT_FONT_SIZE / 2;
    ctx.fillText(text, targetScreenX, yOffset);
    ctx.restore();
  }
}
