import {
  UI_TRIBE_LIST_BACKGROUND_COLOR,
  UI_TRIBE_LIST_BADGE_SIZE,
  UI_TRIBE_LIST_COUNT_FONT_SIZE,
  UI_TRIBE_LIST_HIGHLIGHT_COLOR,
  UI_TRIBE_LIST_ITEM_HEIGHT,
  UI_TRIBE_LIST_MINIATURE_SIZE,
  UI_TRIBE_LIST_PADDING,
  UI_TRIBE_LIST_SPACING,
} from '../../world-consts';
import { TribeInfo } from '../../ui/ui-types';
import { renderMiniatureCharacter } from './render-characters-ui';

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

    // --- Adult Count --
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

    // --- Child Count --
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
