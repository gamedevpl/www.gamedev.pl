import {
  CHILD_TO_ADULT_AGE,
  PLAYER_HEIR_HIGHLIGHT_COLOR,
  PLAYER_HIGHLIGHT_COLOR,
  PLAYER_PARENT_HIGHLIGHT_COLOR,
  PLAYER_PARTNER_HIGHLIGHT_COLOR,
  UI_MINIATURE_HEIR_CROWN_SIZE,
  UI_MINIATURE_PARENT_CROWN_SIZE,
  UI_MINIATURE_PARTNER_CROWN_SIZE,
  UI_MINIATURE_PLAYER_CROWN_SIZE,
} from '../../world-consts';
import { Vector2D } from '../../utils/math-types';
import { TribeHuman2D } from '../../../../../../tools/asset-generator/generator-assets/src/tribe-human-2d/tribe-human-2d.js';
import { HumanEntity } from '../../entities/characters/human/human-types';

/**
 * Draws a crown above the character
 * @param ctx Canvas rendering context
 * @param position Character position
 * @param radius Character radius
 * @param size Size of the crown
 * @param color Color of the crown
 */
function drawCrown(
  ctx: CanvasRenderingContext2D,
  position: { x: number; y: number },
  radius: number,
  size: number,
  color: string,
): void {
  const x = position.x;
  const y = position.y - radius - size / 2;

  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;

  // Draw crown base
  ctx.beginPath();
  ctx.rect(x - size / 2, y, size, size / 2);
  ctx.fill();

  // Draw crown points
  ctx.beginPath();
  // Left point
  ctx.moveTo(x - size / 2, y);
  ctx.lineTo(x - size / 4, y - size / 3);
  ctx.lineTo(x - size / 6, y);

  // Middle point
  ctx.moveTo(x - size / 6, y);
  ctx.lineTo(x, y - size / 2);
  ctx.lineTo(x + size / 6, y);

  // Right point
  ctx.moveTo(x + size / 6, y);
  ctx.lineTo(x + size / 4, y - size / 3);
  ctx.lineTo(x + size / 2, y);

  ctx.stroke();
  ctx.restore();
}

export function renderMiniatureCharacter(
  ctx: CanvasRenderingContext2D,
  position: Vector2D,
  size: number,
  age: number,
  gender: 'male' | 'female',
  isPlayer: boolean = false,
  isHeir: boolean = false,
  isPartner: boolean = false,
  isParent: boolean = false,
): void {
  if (age < CHILD_TO_ADULT_AGE) {
    size = size * 0.75; // Scale down children to 75% of the size
  }
  // The TribeHuman2D.render function handles the visual representation of age and gender.
  // It will render characters with gray hair when they reach old age, and children smaller if size is adjusted.
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

  // Draw crowns for highlighted characters
  let crownSize: number | undefined;
  let highlightColor: string | undefined;

  if (isPlayer) {
    crownSize = UI_MINIATURE_PLAYER_CROWN_SIZE;
    highlightColor = PLAYER_HIGHLIGHT_COLOR;
  } else if (isHeir) {
    crownSize = UI_MINIATURE_HEIR_CROWN_SIZE;
    highlightColor = PLAYER_HEIR_HIGHLIGHT_COLOR;
  } else if (isPartner) {
    crownSize = UI_MINIATURE_PARTNER_CROWN_SIZE;
    highlightColor = PLAYER_PARTNER_HIGHLIGHT_COLOR;
  } else if (isParent) {
    crownSize = UI_MINIATURE_PARENT_CROWN_SIZE;
    highlightColor = PLAYER_PARENT_HIGHLIGHT_COLOR;
  }

  if (crownSize && highlightColor) {
    // The radius for the miniature is half its size.
    drawCrown(ctx, position, size / 2, crownSize, highlightColor);
  }
}

export function drawFamilyMemberBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  members: { member: HumanEntity; isPlayer: boolean; isHeir: boolean; isPartner: boolean; isParent: boolean }[],
  iconSize: number,
  maxWidth: number,
): void {
  ctx.save();

  if (members.length === 0) {
    ctx.restore();
    return;
  }

  const totalIconWidth = members.length * iconSize;
  const defaultPadding = 4;
  let padding: number;

  const totalWidthWithDefaultPadding = totalIconWidth + (members.length - 1) * defaultPadding;

  if (members.length > 1 && totalWidthWithDefaultPadding > maxWidth) {
    // Squeeze the icons to fit exactly into maxWidth. Padding can be negative.
    padding = (maxWidth - totalIconWidth) / (members.length - 1);
  } else {
    // For rows that fit, use default padding.
    padding = defaultPadding;
  }

  // Ensure padding is not applied for a single item row.
  if (members.length <= 1) {
    padding = 0;
  }

  for (let i = 0; i < members.length; i++) {
    const { member, isPlayer, isHeir, isPartner, isParent } = members[i];
    const memberX = x + i * (iconSize + padding) + iconSize / 2;
    const memberY = y + iconSize / 4; // All members are in the same row
    renderMiniatureCharacter(
      ctx,
      { x: memberX, y: memberY },
      iconSize,
      member.age,
      member.gender,
      isPlayer,
      isHeir,
      isPartner,
      isParent,
    );
  }

  ctx.restore();
}
