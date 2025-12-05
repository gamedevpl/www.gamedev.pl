import {
  PLAYER_ACTION_HINT_FONT_SIZE,
  PLAYER_ACTION_OUTLINE_COLOR,
  PLAYER_ACTION_OUTLINE_DASH_PATTERN,
  PLAYER_ACTION_OUTLINE_RADIUS_OFFSET,
} from '../../ui/ui-consts.ts';
import { Vector2D } from '../../utils/math-types';
import { PlayerActionHint, PLAYER_ACTION_EMOJIS, PlayerActionType } from '../../ui/ui-types';
import { HumanEntity } from '../../entities/characters/human/human-types';
import { worldToScreenCoords } from '../render-utils';

const HINT_OFFSET_X = 25;
const HINT_OFFSET_Y = 0;
const LINE_HEIGHT = 28;

export function drawDottedOutline(
  ctx: CanvasRenderingContext2D,
  position: Vector2D,
  radius: number,
  color: string,
  dashPattern: number[],
  lineWidth: number,
  viewportCenter: Vector2D,
  canvasWidth: number,
  canvasHeight: number,
  mapDimensions: { width: number; height: number },
) {
  ctx.save();
  const { x: screenX, y: screenY } = worldToScreenCoords(
    position,
    viewportCenter,
    { width: canvasWidth, height: canvasHeight },
    mapDimensions,
  );

  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.setLineDash(dashPattern);
  ctx.beginPath();
  ctx.arc(screenX, screenY, radius + PLAYER_ACTION_OUTLINE_RADIUS_OFFSET, 0, 2 * Math.PI);
  ctx.stroke();
  ctx.restore();
}

export function renderPlayerActionHints(
  ctx: CanvasRenderingContext2D,
  hints: PlayerActionHint[],
  player: HumanEntity,
  viewportCenter: Vector2D,
  canvasWidth: number,
  canvasHeight: number,
  mapDimensions: { width: number; height: number },
): void {
  hints = hints.filter((hint) => hint.type !== PlayerActionType.FollowMe);
  if (hints.length === 0) {
    return;
  }

  ctx.save();

  // Draw outlines for targets first
  hints.forEach((hint) => {
    if (hint.targetEntity) {
      drawDottedOutline(
        ctx,
        hint.targetEntity.position,
        hint.targetEntity.radius,
        PLAYER_ACTION_OUTLINE_COLOR,
        PLAYER_ACTION_OUTLINE_DASH_PATTERN,
        2,
        viewportCenter,
        canvasWidth,
        canvasHeight,
        mapDimensions,
      );
    }
  });

  // Then, render the text hints
  ctx.font = `${PLAYER_ACTION_HINT_FONT_SIZE}px "Press Start 2P", Arial`;
  ctx.fillStyle = 'white';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.shadowColor = 'black';
  ctx.shadowBlur = 5;

  const { x: playerScreenX, y: playerScreenY } = worldToScreenCoords(
    player.position,
    viewportCenter,
    { width: canvasWidth, height: canvasHeight },
    mapDimensions,
  );

  let nonTargetedHintIndex = 0;
  let targetHintIndicies: Record<number, number> = {};

  hints.forEach((hint) => {
    const emoji = PLAYER_ACTION_EMOJIS[hint.type];

    if (hint.targetEntity) {
      targetHintIndicies[hint.targetEntity.id] = (targetHintIndicies[hint.targetEntity.id] || 0) + 1;
      // For hints with a target, render above the target's outline
      const targetScreenX = hint.targetEntity.position.x - viewportCenter.x + canvasWidth / 2;
      const targetScreenY = hint.targetEntity.position.y - viewportCenter.y + canvasHeight / 2;
      const text = `${emoji}${hint.key.toUpperCase()}`;
      const yOffset =
        targetScreenY -
        hint.targetEntity.radius -
        PLAYER_ACTION_OUTLINE_RADIUS_OFFSET -
        PLAYER_ACTION_HINT_FONT_SIZE / 2 -
        (targetHintIndicies[hint.targetEntity.id] - 1) * LINE_HEIGHT;
      ctx.fillText(text, targetScreenX, yOffset);
    } else {
      // For hints without a target, render next to the player
      ctx.textAlign = 'left';
      const text = `${emoji}${hint.key.toUpperCase()}`;
      const startX = playerScreenX + HINT_OFFSET_X;
      const startY = playerScreenY + HINT_OFFSET_Y;
      const currentY = startY + nonTargetedHintIndex * LINE_HEIGHT;
      ctx.fillText(text, startX, currentY);
      nonTargetedHintIndex++;
      ctx.textAlign = 'center'; // Reset for next iteration if needed
    }
  });

  ctx.restore();
}
