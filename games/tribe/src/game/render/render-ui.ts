import { HumanEntity } from '../entities/characters/human/human-types';
import {
  CHILD_TO_ADULT_AGE,
  PLAYER_ACTION_HINT_FONT_SIZE,
  PLAYER_ACTION_OUTLINE_COLOR,
  PLAYER_ACTION_OUTLINE_DASH_PATTERN,
  PLAYER_ACTION_OUTLINE_RADIUS_OFFSET,
  PLAYER_HEIR_HIGHLIGHT_COLOR,
  PLAYER_HIGHLIGHT_COLOR,
  PLAYER_PARENT_HIGHLIGHT_COLOR,
  PLAYER_PARTNER_HIGHLIGHT_COLOR,
  UI_MINIATURE_HEIR_CROWN_SIZE,
  UI_MINIATURE_PARENT_CROWN_SIZE,
  UI_MINIATURE_PARTNER_CROWN_SIZE,
  UI_MINIATURE_PLAYER_CROWN_SIZE,
  UI_TRIBE_LIST_BACKGROUND_COLOR,
  UI_TRIBE_LIST_BADGE_SIZE,
  UI_TRIBE_LIST_COUNT_FONT_SIZE,
  UI_TRIBE_LIST_HIGHLIGHT_COLOR,
  UI_TRIBE_LIST_ITEM_HEIGHT,
  UI_TRIBE_LIST_MINIATURE_SIZE,
  UI_TRIBE_LIST_PADDING,
  UI_TRIBE_LIST_SPACING,
  UI_TUTORIAL_PANEL_BACKGROUND_COLOR,
  UI_TUTORIAL_HIGHLIGHT_COLOR,
  UI_TUTORIAL_HIGHLIGHT_LINE_WIDTH,
  UI_TUTORIAL_HIGHLIGHT_PADDING,
  UI_TUTORIAL_HIGHLIGHT_PULSE_SPEED,
  UI_TUTORIAL_PANEL_BORDER_RADIUS,
  UI_TUTORIAL_PANEL_PADDING,
  UI_TUTORIAL_PANEL_TEXT_COLOR,
  UI_TUTORIAL_PANEL_WIDTH,
  UI_TUTORIAL_TEXT_FONT_SIZE,
  UI_TUTORIAL_TITLE_FONT_SIZE,
} from '../world-consts';
import { Vector2D } from '../utils/math-types';
import { PlayerActionHint, PLAYER_ACTION_EMOJIS, ClickableUIButton, TribeInfo } from '../ui/ui-types';
import { TribeHuman2D } from '../../../../../tools/asset-generator/generator-assets/src/tribe-human-2d/tribe-human-2d.js';
import { FoodItem, FOOD_TYPE_EMOJIS } from '../food/food-types';
import { Entity } from '../entities/entities-types';
import { TransitionState, Tutorial, TutorialState } from '../tutorial/tutorial-types.js';

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

export function drawFoodBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  foodItems: FoodItem[],
  iconSize: number,
  maxWidth: number,
): void {
  ctx.save();

  if (foodItems.length === 0) {
    ctx.restore();
    return;
  }

  const totalIconWidth = foodItems.length * iconSize;
  let padding: number;

  if (totalIconWidth > maxWidth) {
    padding = (maxWidth - totalIconWidth) / (foodItems.length - 1);
  } else {
    const defaultPadding = 4;
    const totalWidthWithDefaultPadding = totalIconWidth + (foodItems.length - 1) * defaultPadding;
    if (totalWidthWithDefaultPadding > maxWidth) {
      padding = (maxWidth - totalIconWidth) / (foodItems.length - 1);
    } else {
      padding = defaultPadding;
    }
  }

  if (foodItems.length === 1) {
    padding = 0;
  }

  for (let i = 0; i < foodItems.length; i++) {
    const emoji = FOOD_TYPE_EMOJIS[foodItems[i].type];
    ctx.fillText(emoji, x + i * (iconSize + padding), y);
  }
  ctx.restore();
}

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

export function renderTribeList(
  ctx: CanvasRenderingContext2D,
  tribes: TribeInfo[],
  _canvasWidth: number,
  canvasHeight: number,
): void {
  if (tribes.length === 0) {
    return;
  }

  ctx.save();

  const startX = UI_TRIBE_LIST_PADDING;
  // Calculate panel width dynamically based on content
  const adultText = ` ${'00'}`;
  const childText = ` ${'00'}`;
  ctx.font = `${UI_TRIBE_LIST_COUNT_FONT_SIZE}px "Press Start 2P", Arial`;
  const adultTextWidth = ctx.measureText(adultText).width;
  const childTextWidth = ctx.measureText(childText).width;

  const panelWidth =
    UI_TRIBE_LIST_PADDING + // left padding
    UI_TRIBE_LIST_BADGE_SIZE + // badge size
    UI_TRIBE_LIST_PADDING + // padding between badge and counts
    UI_TRIBE_LIST_MINIATURE_SIZE + // adult icon
    adultTextWidth + // adult count text
    UI_TRIBE_LIST_PADDING / 2 + // padding between counts
    UI_TRIBE_LIST_MINIATURE_SIZE + // child icon
    childTextWidth; // child count text;

  const totalPanelHeight = tribes.length * UI_TRIBE_LIST_ITEM_HEIGHT + (tribes.length - 1) * UI_TRIBE_LIST_SPACING;
  const panelY = canvasHeight - totalPanelHeight - UI_TRIBE_LIST_PADDING;

  // Draw background for the entire list
  ctx.fillStyle = UI_TRIBE_LIST_BACKGROUND_COLOR;
  ctx.fillRect(startX, panelY, panelWidth, totalPanelHeight);

  // Draw each tribe entry from top to bottom
  for (let i = 0; i < tribes.length; i++) {
    const tribe = tribes[i];
    const entryY = panelY + i * (UI_TRIBE_LIST_ITEM_HEIGHT + UI_TRIBE_LIST_SPACING);
    const centerY = entryY + UI_TRIBE_LIST_ITEM_HEIGHT / 2;

    // Highlight player's tribe
    if (tribe.isPlayerTribe) {
      ctx.fillStyle = UI_TRIBE_LIST_HIGHLIGHT_COLOR;
      ctx.fillRect(startX, entryY, panelWidth, UI_TRIBE_LIST_ITEM_HEIGHT);
    }

    let currentX = startX + UI_TRIBE_LIST_PADDING;

    // --- Badge --
    ctx.font = `${UI_TRIBE_LIST_BADGE_SIZE}px "Press Start 2P", Arial`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText(tribe.tribeBadge, currentX, centerY - UI_TRIBE_LIST_BADGE_SIZE / 4);
    currentX += UI_TRIBE_LIST_BADGE_SIZE + UI_TRIBE_LIST_PADDING * 1.1;

    // --- Adult Count ---
    if (tribe.adultCount > 0) {
      // Render adult miniature
      renderMiniatureCharacter(
        ctx,
        { x: currentX + UI_TRIBE_LIST_MINIATURE_SIZE / 2, y: centerY },
        UI_TRIBE_LIST_MINIATURE_SIZE,
        25, // Representative adult age
        'male', // Gender doesn't matter for the icon here
      );
      currentX += UI_TRIBE_LIST_MINIATURE_SIZE / 2;

      // Render adult count text
      ctx.font = `${UI_TRIBE_LIST_COUNT_FONT_SIZE}px "Press Start 2P", Arial`;
      ctx.fillStyle = 'white';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.fillText(` ${tribe.adultCount}`, currentX, centerY);
      currentX += ctx.measureText(` ${tribe.adultCount}`).width + UI_TRIBE_LIST_PADDING / 2;
    }

    // --- Child Count ---
    if (tribe.childCount > 0) {
      // Render child miniature
      renderMiniatureCharacter(
        ctx,
        { x: currentX + UI_TRIBE_LIST_MINIATURE_SIZE / 2, y: centerY },
        UI_TRIBE_LIST_MINIATURE_SIZE,
        1, // Representative child age
        'female', // Gender doesn't matter for the icon here
      );
      currentX += UI_TRIBE_LIST_MINIATURE_SIZE / 2;

      // Render child count text
      ctx.font = `${UI_TRIBE_LIST_COUNT_FONT_SIZE}px "Press Start 2P", Arial`;
      ctx.fillStyle = 'white';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.fillText(` ${tribe.childCount}`, currentX, centerY);
    }
  }

  ctx.restore();
}

export function renderTutorialHighlight(
  ctx: CanvasRenderingContext2D,
  entity: Entity,
  radius: number,
  color: string,
  time: number,
): void {
  ctx.save();
  const { position } = entity;

  ctx.strokeStyle = color;
  // Pulsing effect for line width
  ctx.lineWidth = 2 + Math.sin(time * 5) * 1.5;
  ctx.setLineDash([8, 8]);
  ctx.beginPath();
  ctx.arc(position.x, position.y, radius, 0, 2 * Math.PI);
  ctx.stroke();
  ctx.restore();
}

export function renderTutorialPanel(
  ctx: CanvasRenderingContext2D,
  tutorialState: TutorialState,
  tutorial: Tutorial,
  canvasWidth: number,
  canvasHeight: number,
): void {
  if (tutorialState.transitionState === TransitionState.INACTIVE) {
    return;
  }

  const currentStep = tutorial.steps[tutorialState.currentStepIndex];
  if (!currentStep) {
    return;
  }

  ctx.save();

  ctx.globalAlpha = tutorialState.transitionAlpha;

  // Panel properties
  const panelWidth = UI_TUTORIAL_PANEL_WIDTH;
  const padding = UI_TUTORIAL_PANEL_PADDING;
  const borderRadius = UI_TUTORIAL_PANEL_BORDER_RADIUS;

  // Text properties
  const titleFont = `${UI_TUTORIAL_TITLE_FONT_SIZE}px "Press Start 2P", Arial`;
  const textFont = `${UI_TUTORIAL_TEXT_FONT_SIZE}px "Press Start 2P", Arial`;
  const textColor = UI_TUTORIAL_PANEL_TEXT_COLOR;
  const lineHeight = UI_TUTORIAL_TEXT_FONT_SIZE * 1.5;

  // --- Calculate text wrapping and panel height ---
  ctx.font = textFont;
  const words = currentStep.text.split(' ');
  let line = '';
  const lines: string[] = [];

  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + ' ';
    const metrics = ctx.measureText(testLine);
    const testWidth = metrics.width;
    if (testWidth > panelWidth - padding * 2 && n > 0) {
      lines.push(line);
      line = words[n] + ' ';
    } else {
      line = testLine;
    }
  }
  lines.push(line);

  const panelHeight = padding * 2 + UI_TUTORIAL_TITLE_FONT_SIZE + padding / 2 + lines.length * lineHeight;
  const panelX = (canvasWidth - panelWidth) / 2;
  const panelY = canvasHeight - panelHeight - 20; // 20px offset from bottom

  // --- Draw panel background ---
  ctx.fillStyle = UI_TUTORIAL_PANEL_BACKGROUND_COLOR;
  ctx.beginPath();
  ctx.moveTo(panelX + borderRadius, panelY);
  ctx.lineTo(panelX + panelWidth - borderRadius, panelY);
  ctx.quadraticCurveTo(panelX + panelWidth, panelY, panelX + panelWidth, panelY + borderRadius);
  ctx.lineTo(panelX + panelWidth, panelY + panelHeight - borderRadius);
  ctx.quadraticCurveTo(
    panelX + panelWidth,
    panelY + panelHeight,
    panelX + panelWidth - borderRadius,
    panelY + panelHeight,
  );
  ctx.lineTo(panelX + borderRadius, panelY + panelHeight);
  ctx.quadraticCurveTo(panelX, panelY + panelHeight, panelX, panelY + panelHeight - borderRadius);
  ctx.lineTo(panelX, panelY + borderRadius);
  ctx.quadraticCurveTo(panelX, panelY, panelX + borderRadius, panelY);
  ctx.closePath();
  ctx.fill();

  // --- Draw text ---
  ctx.fillStyle = textColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  // Title
  ctx.font = titleFont;
  ctx.fillText(currentStep.title, panelX + panelWidth / 2, panelY + padding);

  // Body text
  ctx.font = textFont;
  let textY = panelY + padding + UI_TUTORIAL_TITLE_FONT_SIZE + padding / 2;
  for (const l of lines) {
    ctx.fillText(l, panelX + panelWidth / 2, textY);
    textY += lineHeight;
  }

  ctx.restore();
}

export function renderUIElementHighlight(
  ctx: CanvasRenderingContext2D,
  rect: { x: number; y: number; width: number; height: number },
  time: number,
): void {
  ctx.save();

  const padding = UI_TUTORIAL_HIGHLIGHT_PADDING;
  const highlightRect = {
    x: rect.x - padding,
    y: rect.y - padding,
    width: rect.width + padding * 2,
    height: rect.height + padding * 2,
  };

  ctx.strokeStyle = UI_TUTORIAL_HIGHLIGHT_COLOR;
  // Pulsing effect for line width
  ctx.lineWidth = UI_TUTORIAL_HIGHLIGHT_LINE_WIDTH + Math.sin(time * UI_TUTORIAL_HIGHLIGHT_PULSE_SPEED) * 1.5;
  ctx.setLineDash([8, 8]);
  ctx.strokeRect(highlightRect.x, highlightRect.y, highlightRect.width, highlightRect.height);
  ctx.restore();
}
