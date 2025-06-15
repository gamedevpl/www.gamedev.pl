import { HumanEntity } from '../entities/characters/human/human-types';
import {
  PLAYER_ACTION_HINT_FONT_SIZE,
  PLAYER_ACTION_OUTLINE_COLOR,
  PLAYER_ACTION_OUTLINE_DASH_PATTERN,
  PLAYER_ACTION_OUTLINE_RADIUS_OFFSET,
} from '../world-consts';
import { Vector2D } from '../utils/math-types';
import { PlayerActionHint, PLAYER_ACTION_EMOJIS, ClickableUIButton } from '../ui/ui-types';
import { TribeHuman2D } from '../../../../../tools/asset-generator/generator-assets/src/tribe-human-2d/tribe-human-2d.js';

const HINT_OFFSET_X = 25;
const HINT_OFFSET_Y = 0;
const LINE_HEIGHT = 28;

function drawDottedOutline(
  ctx: CanvasRenderingContext2D,
  position: Vector2D,
  radius: number,
  color: string,
  dashPattern: number[],
  lineWidth: number,
  viewportCenter: Vector2D,
  canvasWidth: number,
  canvasHeight: number,
) {
  ctx.save();
  const screenX = position.x - viewportCenter.x + canvasWidth / 2;
  const screenY = position.y - viewportCenter.y + canvasHeight / 2;

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
): void {
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

  const playerScreenX = player.position.x - viewportCenter.x + canvasWidth / 2;
  const playerScreenY = player.position.y - viewportCenter.y + canvasHeight / 2;

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

export function drawButton(ctx: CanvasRenderingContext2D, button: ClickableUIButton): void {
  ctx.save();

  // Draw button background
  ctx.fillStyle = button.backgroundColor;
  ctx.fillRect(button.rect.x, button.rect.y, button.rect.width, button.rect.height);

  // Draw button text
  ctx.fillStyle = button.textColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(button.text, button.rect.x + button.rect.width / 2, button.rect.y + button.rect.height / 2);

  ctx.restore();
}

export function drawProgressBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  progress: number, // 0 to 1
  backgroundColor: string,
  foregroundColor: string,
): void {
  ctx.save();
  ctx.fillStyle = backgroundColor;
  ctx.fillRect(x, y, width, height);
  ctx.fillStyle = foregroundColor;
  ctx.fillRect(x, y, width * Math.max(0, progress), height);
  ctx.restore();
}

export function drawDiscreteBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  emoji: string,
  _maxItems: number,
  currentItems: number,
  iconSize: number,
  maxWidth: number,
): void {
  ctx.save();

  if (currentItems <= 0) {
    ctx.restore();
    return;
  }

  // Calculate the total width of all icons without padding
  const totalIconWidth = currentItems * iconSize;
  let padding: number;

  // If the total width exceeds maxWidth, squeeze the icons together
  if (totalIconWidth > maxWidth) {
    padding = (maxWidth - totalIconWidth) / (currentItems - 1);
  } else {
    // Otherwise, use a default padding, ensuring it doesn't push the bar beyond maxWidth
    const defaultPadding = 4; // A reasonable default padding
    const totalWidthWithDefaultPadding = totalIconWidth + (currentItems - 1) * defaultPadding;
    if (totalWidthWithDefaultPadding > maxWidth) {
      padding = (maxWidth - totalIconWidth) / (currentItems - 1);
    } else {
      padding = defaultPadding;
    }
  }

  // Ensure padding is not negative if there's only one item
  if (currentItems === 1) {
    padding = 0;
  }

  for (let i = 0; i < currentItems; i++) {
    ctx.fillText(emoji, x + i * (iconSize + padding), y);
  }
  ctx.restore();
}

export function renderMiniatureCharacter(
  ctx: CanvasRenderingContext2D,
  position: Vector2D,
  size: number,
  age: number,
  gender: 'male' | 'female',
): void {
  TribeHuman2D.render(
    ctx,
    position.x - size / 2,
    position.y - size / 2,
    size,
    size,
    0, // animationProgress
    'idle', // stance
    gender,
    age,
    [0, 0], // direction
    false, // isPregnant
    0, // hunger
  );
}
