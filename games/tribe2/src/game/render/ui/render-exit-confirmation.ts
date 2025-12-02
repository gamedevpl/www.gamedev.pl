import {
  UI_BUTTON_ACTIVATED_BORDER_COLOR,
  UI_BUTTON_ACTIVATED_PULSE_SPEED,
  UI_BUTTON_BACKGROUND_COLOR,
  UI_BUTTON_BORDER_RADIUS,
  UI_BUTTON_DISABLED_BACKGROUND_COLOR,
  UI_BUTTON_DISABLED_TEXT_COLOR,
  UI_BUTTON_FLASH_COLOR,
  UI_BUTTON_FLASH_DURATION_MS,
  UI_BUTTON_HEIGHT,
  UI_BUTTON_HOVER_BACKGROUND_COLOR,
  UI_BUTTON_TEXT_COLOR,
  UI_BUTTON_WIDTH,
  UI_FONT_SIZE,
  UI_PADDING,
} from '../../ui-consts';
import { ClickableUIButton, UIButtonActionType } from '../../ui/ui-types';
import { GameWorldState } from '../../world-types';

// NOTE: This function is duplicated from render-buttons.ts to avoid circular dependencies
// or having to modify another file just to export it.
function drawButton(ctx: CanvasRenderingContext2D, button: ClickableUIButton, isHovered: boolean): void {
  ctx.save();

  const { x, y, width, height } = button.rect;
  const r = UI_BUTTON_BORDER_RADIUS;

  // Create the rounded rectangle path
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();

  // Fill the background
  ctx.fillStyle = button.isDisabled ? UI_BUTTON_DISABLED_BACKGROUND_COLOR : button.backgroundColor;
  ctx.fill();

  // Draw pulsing border if activated
  if (button.activated) {
    ctx.save();
    const pulse = (Math.sin((Date.now() / 1000) * UI_BUTTON_ACTIVATED_PULSE_SPEED) + 1) / 2; // Varies between 0 and 1
    ctx.strokeStyle = UI_BUTTON_ACTIVATED_BORDER_COLOR;
    ctx.lineWidth = 2 + pulse * 2; // Varies between 2 and 4
    ctx.globalAlpha = 0.7 + pulse * 0.3; // Varies between 0.7 and 1.0
    ctx.stroke(); // Stroke the existing path
    ctx.restore();
  }

  // Draw flash effect if recently activated
  if (button.lastActivated) {
    const timeSinceActivation = Date.now() - button.lastActivated;
    if (timeSinceActivation < UI_BUTTON_FLASH_DURATION_MS) {
      const flashOpacity = 1 - timeSinceActivation / UI_BUTTON_FLASH_DURATION_MS;
      ctx.fillStyle = UI_BUTTON_FLASH_COLOR;
      ctx.globalAlpha = flashOpacity;
      ctx.fill(); // Fill over the background
      ctx.globalAlpha = 1; // Reset alpha
    }
  }

  // Draw hover effect
  if (isHovered && !button.isDisabled) {
    ctx.fillStyle = UI_BUTTON_HOVER_BACKGROUND_COLOR;
    ctx.globalAlpha = 0.5;
    ctx.fill(); // Fill over the background
    ctx.globalAlpha = 1;
  }

  // Determine text color
  ctx.fillStyle = button.isDisabled ? UI_BUTTON_DISABLED_TEXT_COLOR : button.textColor;

  if (button.icon) {
    // Render large icon in the center
    ctx.font = `${height * 0.55}px "Press Start 2P", Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(button.icon, x + width / 2, y + height / 2);

    // Render small text in the bottom right corner
    if (button.text) {
      ctx.font = `${height * 0.18}px "Press Start 2P", Arial`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText(button.text, x + width - 4, y + height - 2);
    }
  } else {
    ctx.font = `${UI_FONT_SIZE * 1.5}px "Press Start 2P", Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(button.text, x + width / 2, y + height / 2);
  }

  ctx.restore();
}

export function renderExitConfirmation(
  ctx: CanvasRenderingContext2D,
  gameState: GameWorldState,
  canvasWidth: number,
  canvasHeight: number,
) {
  ctx.save();

  // 1. Draw overlay
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // 2. Define dialog box dimensions
  const dialogWidth = 500;
  const dialogHeight = 150;
  const dialogX = (canvasWidth - dialogWidth) / 2;
  const dialogY = (canvasHeight - dialogHeight) / 2;

  // 4. Render confirmation text
  ctx.fillStyle = UI_BUTTON_TEXT_COLOR;
  ctx.font = `${UI_FONT_SIZE * 1.1}px "Press Start 2P", Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Are you sure you want to exit', canvasWidth / 2, dialogY + dialogHeight / 3 - 10);
  ctx.fillText('to the main menu?', canvasWidth / 2, dialogY + dialogHeight / 3 + 10);

  // 5. Define and add buttons
  const buttonWidth = UI_BUTTON_WIDTH * 1.5;
  const buttonHeight = UI_BUTTON_HEIGHT;
  const buttonY = dialogY + dialogHeight - buttonHeight - UI_PADDING * 2;
  const buttonSpacing = 20;
  const totalButtonsWidth = buttonWidth * 2 + buttonSpacing;
  const startX = dialogX + (dialogWidth - totalButtonsWidth) / 2;

  const yesButton: ClickableUIButton = {
    id: 'confirmExitYes',
    action: UIButtonActionType.ConfirmExitYes,
    rect: { x: startX, y: buttonY, width: buttonWidth, height: buttonHeight },
    text: 'Yes',
    backgroundColor: UI_BUTTON_BACKGROUND_COLOR,
    textColor: UI_BUTTON_TEXT_COLOR,
    currentWidth: buttonWidth,
  };

  const noButtonX = startX + buttonWidth + buttonSpacing;
  const noButton: ClickableUIButton = {
    id: 'confirmExitNo',
    action: UIButtonActionType.ConfirmExitNo,
    rect: { x: noButtonX, y: buttonY, width: buttonWidth, height: buttonHeight },
    text: 'No',
    backgroundColor: UI_BUTTON_BACKGROUND_COLOR,
    textColor: UI_BUTTON_TEXT_COLOR,
    currentWidth: buttonWidth,
  };

  // Add buttons to the game state so they can be clicked
  // It's important to clear them on each frame somewhere else (e.g., in render.ts)
  gameState.uiButtons.push(yesButton, noButton);

  // 6. Draw the buttons
  drawButton(ctx, yesButton, gameState.hoveredButtonId === yesButton.id);
  drawButton(ctx, noButton, gameState.hoveredButtonId === noButton.id);

  ctx.restore();
}
