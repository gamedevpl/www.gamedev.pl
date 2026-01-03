import { GameWorldState, DiplomacyStatus } from '../../world-types';
import { TribeInfo, ClickableUIButton, UIButtonActionType } from '../../ui/ui-types';
import {
  UI_TRIBE_LIST_ITEM_HEIGHT,
  UI_TRIBE_LIST_SPACING,
  UI_TRIBE_LIST_PADDING,
  UI_TRIBE_LIST_BADGE_SIZE,
  UI_MINIATURE_CHARACTER_SIZE,
  UI_TRIBE_LIST_COUNT_FONT_SIZE,
  UI_BUTTON_HOVER_BACKGROUND_COLOR,
  UI_BUTTON_BACKGROUND_COLOR,
  UI_BUTTON_TEXT_COLOR,
} from '../../ui/ui-consts';
import { renderMiniatureCharacter } from './render-characters-ui';

/**
 * Renders a centered modal overlay listing all tribes and their status.
 */
export function renderTribeModal(
  ctx: CanvasRenderingContext2D,
  gameState: GameWorldState,
  tribes: TribeInfo[],
  canvasWidth: number,
  canvasHeight: number,
): void {
  ctx.save();

  // --- 1. Dim Background ---
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // --- 2. Modal Dimensions & Background ---
  const modalWidth = 500;
  const modalHeight = Math.min(canvasHeight * 0.8, tribes.length * (UI_TRIBE_LIST_ITEM_HEIGHT + UI_TRIBE_LIST_SPACING) + 120);
  const modalX = (canvasWidth - modalWidth) / 2;
  const modalY = (canvasHeight - modalHeight) / 2;

  ctx.fillStyle = '#2d3748';
  ctx.strokeStyle = '#4a5568';
  ctx.lineWidth = 4;
  ctx.fillRect(modalX, modalY, modalWidth, modalHeight);
  ctx.strokeRect(modalX, modalY, modalWidth, modalHeight);

  // --- 3. Header ---
  ctx.fillStyle = '#fff';
  ctx.font = '20px "Press Start 2P", Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('WORLD TRIBES', canvasWidth / 2, modalY + 30);

  // --- 4. Tribe List ---
  const listStartY = modalY + 80;
  const itemWidth = modalWidth - UI_TRIBE_LIST_PADDING * 4;
  const itemX = modalX + UI_TRIBE_LIST_PADDING * 2;

  for (let i = 0; i < tribes.length; i++) {
    const tribe = tribes[i];
    const entryY = listStartY + i * (UI_TRIBE_LIST_ITEM_HEIGHT + UI_TRIBE_LIST_SPACING);
    
    // Don't render if outside modal bounds (simple clipping)
    if (entryY + UI_TRIBE_LIST_ITEM_HEIGHT > modalY + modalHeight - 60) break;

    const centerY = entryY + UI_TRIBE_LIST_ITEM_HEIGHT / 2;

    // Highlight player's tribe
    if (tribe.isPlayerTribe) {
      ctx.fillStyle = 'rgba(255, 215, 0, 0.2)';
      ctx.fillRect(itemX, entryY, itemWidth, UI_TRIBE_LIST_ITEM_HEIGHT);
    }

    let currentX = itemX + UI_TRIBE_LIST_PADDING;

    // --- Badge --
    ctx.font = `${UI_TRIBE_LIST_BADGE_SIZE}px "Press Start 2P", Arial`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = 'white';
    ctx.fillText(tribe.tribeBadge, currentX, centerY);
    currentX += UI_TRIBE_LIST_BADGE_SIZE + UI_TRIBE_LIST_PADDING * 2;

    // --- Diplomacy Status & Button ---
    if (!tribe.isPlayerTribe) {
      const diplomacyIcon = tribe.diplomacyStatus === DiplomacyStatus.Friendly ? '🤝' : '⚔️';
      const buttonId = `modal_diplomacy_${tribe.leaderId}`;
      const buttonRect = {
        x: currentX,
        y: centerY - UI_TRIBE_LIST_BADGE_SIZE / 2,
        width: UI_TRIBE_LIST_BADGE_SIZE * 1.5,
        height: UI_TRIBE_LIST_BADGE_SIZE,
      };

      const button: ClickableUIButton = {
        id: buttonId,
        action: UIButtonActionType.ToggleDiplomacy,
        rect: buttonRect,
        text: '',
        icon: diplomacyIcon,
        backgroundColor: 'transparent',
        textColor: 'white',
        currentWidth: buttonRect.width,
        tooltip: `Set status to ${tribe.diplomacyStatus === DiplomacyStatus.Friendly ? 'Hostile' : 'Friendly'}`,
        targetTribeId: tribe.leaderId,
      };
      gameState.uiButtons.push(button);

      if (gameState.hoveredButtonId === buttonId) {
        ctx.fillStyle = UI_BUTTON_HOVER_BACKGROUND_COLOR;
        ctx.fillRect(buttonRect.x, buttonRect.y, buttonRect.width, buttonRect.height);
      }

      ctx.font = `${UI_TRIBE_LIST_BADGE_SIZE * 0.8}px Arial`;
      ctx.textAlign = 'center';
      ctx.fillText(diplomacyIcon, buttonRect.x + buttonRect.width / 2, centerY);
    } else {
      ctx.fillStyle = '#aaa';
      ctx.font = '10px "Press Start 2P", Arial';
      ctx.textAlign = 'left';
      ctx.fillText('(YOU)', currentX, centerY);
    }
    currentX += UI_TRIBE_LIST_BADGE_SIZE * 2 + UI_TRIBE_LIST_PADDING;

    // --- Stats (Adults/Children) ---
    // Adults
    renderMiniatureCharacter(ctx, { x: currentX + 10, y: centerY }, UI_MINIATURE_CHARACTER_SIZE * 0.6, 25, 'male');
    ctx.fillStyle = 'white';
    ctx.font = `${UI_TRIBE_LIST_COUNT_FONT_SIZE}px "Press Start 2P"`;
    ctx.fillText(`${tribe.adultCount}`, currentX + 30, centerY);
    
    currentX += 80;

    // Children
    renderMiniatureCharacter(ctx, { x: currentX + 10, y: centerY }, UI_MINIATURE_CHARACTER_SIZE * 0.6, 5, 'female');
    ctx.fillText(`${tribe.childCount}`, currentX + 30, centerY);
  }

  // --- 5. Close Button ---
  const closeBtnWidth = 120;
  const closeBtnHeight = 40;
  const closeBtnX = canvasWidth / 2 - closeBtnWidth / 2;
  const closeBtnY = modalY + modalHeight - 60;
  const closeBtnId = 'close_tribe_modal_btn';

  const closeButton: ClickableUIButton = {
    id: closeBtnId,
    action: UIButtonActionType.CloseTribeModal,
    rect: { x: closeBtnX, y: closeBtnY, width: closeBtnWidth, height: closeBtnHeight },
    text: 'CLOSE',
    currentWidth: closeBtnWidth,
    backgroundColor: UI_BUTTON_BACKGROUND_COLOR,
    textColor: UI_BUTTON_TEXT_COLOR,
  };
  gameState.uiButtons.push(closeButton);

  ctx.fillStyle = gameState.hoveredButtonId === closeBtnId ? '#4a5568' : UI_BUTTON_BACKGROUND_COLOR;
  ctx.fillRect(closeBtnX, closeBtnY, closeBtnWidth, closeBtnHeight);
  ctx.strokeStyle = '#fff';
  ctx.strokeRect(closeBtnX, closeBtnY, closeBtnWidth, closeBtnHeight);

  ctx.fillStyle = UI_BUTTON_TEXT_COLOR;
  ctx.font = '12px "Press Start 2P", Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('CLOSE', canvasWidth / 2, closeBtnY + closeBtnHeight / 2);

  ctx.restore();
}
