import {
  UI_AUTOPILOT_BUTTON_SIZE,
  UI_AUTOPILOT_BUTTON_SPACING,
  UI_BUTTON_ACTIVE_BACKGROUND_COLOR,
  UI_BUTTON_BACKGROUND_COLOR,
  UI_BUTTON_BORDER_RADIUS,
  UI_BUTTON_HEIGHT,
  UI_BUTTON_HOVER_BACKGROUND_COLOR,
  UI_BUTTON_SPACING,
  UI_BUTTON_TEXT_COLOR,
  UI_BUTTON_WIDTH,
  UI_PADDING,
  UI_TOOLTIP_BACKGROUND_COLOR,
  UI_TOOLTIP_FONT_SIZE,
  UI_TOOLTIP_OFFSET_Y,
  UI_TOOLTIP_PADDING,
  UI_TOOLTIP_TEXT_COLOR,
} from '../../world-consts';
import { GameWorldState } from '../../world-types.js';
import { ClickableUIButton, PlayerActionType, PLAYER_ACTION_EMOJIS, UIButtonActionType } from '../../ui/ui-types';
import { Rect2D, Vector2D } from '../../utils/math-types';

function drawButton(ctx: CanvasRenderingContext2D, button: ClickableUIButton, isHovered: boolean): void {
  ctx.save();

  const { x, y, width, height } = button.rect;
  const r = UI_BUTTON_BORDER_RADIUS;

  // Determine background color based on hover state
  ctx.fillStyle = isHovered ? UI_BUTTON_HOVER_BACKGROUND_COLOR : button.backgroundColor;

  // Draw rounded rectangle path
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
  ctx.fill();

  // Draw button text
  ctx.fillStyle = button.textColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(button.text, x + width / 2, y + height / 2);

  ctx.restore();
}

function renderTooltip(ctx: CanvasRenderingContext2D, rect: Rect2D, text: string, mousePosition: Vector2D): void {
  ctx.save();

  // Tooltip Style
  ctx.font = `${UI_TOOLTIP_FONT_SIZE}px "Press Start 2P", Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';

  // Measure text
  const textMetrics = ctx.measureText(text);
  const textWidth = textMetrics.width;
  const textHeight = UI_TOOLTIP_FONT_SIZE; // Approximate height

  // Tooltip Box
  const boxWidth = textWidth + UI_TOOLTIP_PADDING * 2;
  const boxHeight = textHeight + UI_TOOLTIP_PADDING * 2;
  const boxX = mousePosition.x - boxWidth / 2;
  // check if mose position is closer to bottom or top of canvas
  const canvasHeight = ctx.canvas.height;
  const boxY =
    rect.y < canvasHeight / 2 ? rect.y + rect.height - UI_TOOLTIP_OFFSET_Y : rect.y - boxHeight + UI_TOOLTIP_OFFSET_Y;

  // Draw Box
  ctx.fillStyle = UI_TOOLTIP_BACKGROUND_COLOR;
  ctx.fillRect(boxX, boxY, boxWidth, boxHeight);

  // Draw Text
  ctx.fillStyle = UI_TOOLTIP_TEXT_COLOR;
  ctx.fillText(text, mousePosition.x, boxY + boxHeight / 2 + textHeight / 2);

  ctx.restore();
}

function renderAutopilotPanel(gameState: GameWorldState, canvasWidth: number, canvasHeight: number): void {
  // Remove old behavior buttons before adding new ones
  gameState.uiButtons = gameState.uiButtons.filter(
    (btn) =>
      btn.action !== UIButtonActionType.ToggleProcreationBehavior &&
      btn.action !== UIButtonActionType.TogglePlantingBehavior,
  );

  if (gameState.autopilotControls.isActive) {
    const totalWidth = UI_AUTOPILOT_BUTTON_SIZE * 2 + UI_AUTOPILOT_BUTTON_SPACING;
    const startX = (canvasWidth - totalWidth) / 2;
    const buttonY = canvasHeight - UI_AUTOPILOT_BUTTON_SIZE - 20;

    // 1. Procreation Button
    const procreationBehavior = gameState.autopilotControls.behaviors.procreation;
    const procreationText = `${PLAYER_ACTION_EMOJIS[PlayerActionType.Procreate]} (R)`;
    const procreationButton: ClickableUIButton = {
      id: 'toggleProcreationButton',
      action: UIButtonActionType.ToggleProcreationBehavior,
      rect: {
        x: startX,
        y: buttonY,
        width: UI_AUTOPILOT_BUTTON_SIZE,
        height: UI_AUTOPILOT_BUTTON_SIZE,
      },
      text: procreationText,
      backgroundColor: procreationBehavior ? UI_BUTTON_ACTIVE_BACKGROUND_COLOR : UI_BUTTON_BACKGROUND_COLOR,
      textColor: UI_BUTTON_TEXT_COLOR,
      currentWidth: UI_AUTOPILOT_BUTTON_SIZE,
      tooltip: `Procreation: ${procreationBehavior ? 'ON' : 'OFF'}`,
    };
    gameState.uiButtons.push(procreationButton);

    // 2. Planting Button
    const plantingButtonX = startX + UI_AUTOPILOT_BUTTON_SIZE + UI_AUTOPILOT_BUTTON_SPACING;
    const plantingBehavior = gameState.autopilotControls.behaviors.planting;
    const plantingText = `${PLAYER_ACTION_EMOJIS[PlayerActionType.PlantBush]} (B)`;
    const plantingButton: ClickableUIButton = {
      id: 'togglePlantingButton',
      action: UIButtonActionType.TogglePlantingBehavior,
      rect: {
        x: plantingButtonX,
        y: buttonY,
        width: UI_AUTOPILOT_BUTTON_SIZE,
        height: UI_AUTOPILOT_BUTTON_SIZE,
      },
      text: plantingText,
      backgroundColor: plantingBehavior ? UI_BUTTON_ACTIVE_BACKGROUND_COLOR : UI_BUTTON_BACKGROUND_COLOR,
      textColor: UI_BUTTON_TEXT_COLOR,
      currentWidth: UI_AUTOPILOT_BUTTON_SIZE,
      tooltip: `Planting: ${plantingBehavior ? 'ON' : 'OFF'}`,
    };
    gameState.uiButtons.push(plantingButton);
  }
}

export function renderUIButtons(ctx: CanvasRenderingContext2D, gameState: GameWorldState, canvasWidth: number): void {
  ctx.save();

  // --- Update Button State & Definitions ---
  // This section modifies the buttons in the gameState before drawing.

  // 1. Update Top-Right Buttons
  ctx.textAlign = 'right';
  let currentButtonX = canvasWidth - UI_PADDING;

  // Find and update main control buttons
  const autopilotButton = gameState.uiButtons.find((b) => b.action === UIButtonActionType.ToggleAutopilot);
  if (autopilotButton) {
    autopilotButton.text = `AUT[O]`;
    autopilotButton.backgroundColor = gameState.autopilotControls.isActive
      ? UI_BUTTON_ACTIVE_BACKGROUND_COLOR
      : UI_BUTTON_BACKGROUND_COLOR;
    autopilotButton.tooltip = `Toggle Autopilot (${gameState.autopilotControls.isActive ? 'ON' : 'OFF'})`;
  }

  const muteButton = gameState.uiButtons.find((b) => b.action === UIButtonActionType.ToggleMute);
  if (muteButton) {
    muteButton.text = gameState.isMuted ? `UN[M]UTE` : `[M]UTE`;
    muteButton.backgroundColor = gameState.isMuted ? UI_BUTTON_ACTIVE_BACKGROUND_COLOR : UI_BUTTON_BACKGROUND_COLOR;
    muteButton.tooltip = `Toggle Sound (${gameState.isMuted ? 'Muted' : 'Enabled'})`;
  }

  const pauseButton = gameState.uiButtons.find((b) => b.action === UIButtonActionType.TogglePause);
  if (pauseButton) {
    pauseButton.text = gameState.isPaused ? `UN[P]AUSE` : `[P]AUSE`;
    pauseButton.backgroundColor = gameState.isPaused ? UI_BUTTON_ACTIVE_BACKGROUND_COLOR : UI_BUTTON_BACKGROUND_COLOR;
    pauseButton.currentWidth = gameState.isPaused ? UI_BUTTON_WIDTH * 1.4 : UI_BUTTON_WIDTH * 1.1;
    pauseButton.tooltip = gameState.isPaused ? 'Resume Game' : 'Pause Game';
  }

  // 2. Update Autopilot Panel Buttons (if active)
  renderAutopilotPanel(gameState, canvasWidth, ctx.canvas.height);

  // --- Position and Draw All Buttons ---
  // This section draws the buttons based on their updated state.

  // Draw Top-Right Buttons
  gameState.uiButtons
    .filter(
      (b) =>
        b.action === UIButtonActionType.ToggleAutopilot ||
        b.action === UIButtonActionType.ToggleMute ||
        b.action === UIButtonActionType.TogglePause,
    )
    .forEach((button) => {
      const buttonY = UI_PADDING;
      const buttonX = currentButtonX - button.currentWidth;
      button.rect = { x: buttonX, y: buttonY, width: button.currentWidth, height: UI_BUTTON_HEIGHT };
      drawButton(ctx, button, gameState.hoveredButtonId === button.id);
      currentButtonX -= button.currentWidth + UI_BUTTON_SPACING;
    });

  // Draw Autopilot Behavior Buttons
  gameState.uiButtons
    .filter(
      (b) =>
        b.action === UIButtonActionType.ToggleProcreationBehavior ||
        b.action === UIButtonActionType.TogglePlantingBehavior,
    )
    .forEach((button) => {
      // The rect is already set in renderAutopilotPanel
      drawButton(ctx, button, gameState.hoveredButtonId === button.id);
    });

  // --- Render Tooltip ---
  const hoveredButton = gameState.hoveredButtonId
    ? gameState.uiButtons.find((b) => b.id === gameState.hoveredButtonId)
    : undefined;

  if (hoveredButton && hoveredButton.tooltip && gameState.mousePosition) {
    renderTooltip(ctx, hoveredButton.rect, hoveredButton.tooltip, gameState.mousePosition);
  }

  ctx.restore();
}
