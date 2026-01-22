import {
  UI_AUTOPILOT_BUTTON_SIZE,
  UI_BUTTON_ACTIVE_BACKGROUND_COLOR,
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
  UI_BUTTON_SPACING,
  UI_BUTTON_TEXT_COLOR,
  UI_BUTTON_WIDTH,
  UI_PADDING,
  UI_TOOLTIP_BACKGROUND_COLOR,
  UI_TOOLTIP_FONT_SIZE,
  UI_TOOLTIP_MAX_WIDTH,
  UI_TOOLTIP_OFFSET_Y,
  UI_TOOLTIP_PADDING,
  UI_TOOLTIP_TEXT_COLOR,
} from '../../ui/ui-consts.ts';
import { GameWorldState } from '../../world-types.js';
import { ClickableUIButton, UIButtonActionType } from '../../ui/ui-types';
import { Rect2D, Vector2D } from '../../utils/math-types';
import { findPlayerEntity } from '../../utils/world-utils';
import { HumanEntity } from '../../entities/characters/human/human-types';
import { StrategicObjective } from '../../entities/tribe/tribe-types';
import { getObjectiveIcon, getObjectiveName } from './render-strategic-menu';

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
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(button.text, x + width / 2, y + height / 2);
  }

  ctx.restore();
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = words[0];

  for (let i = 1; i < words.length; i++) {
    const word = words[i];
    const width = ctx.measureText(currentLine + ' ' + word).width;
    if (width < maxWidth) {
      currentLine += ' ' + word;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }
  lines.push(currentLine);
  return lines;
}

export function renderUITooltip(
  ctx: CanvasRenderingContext2D,
  rect: Rect2D,
  text: string,
  mousePosition: Vector2D,
  fixedTooltipY?: number,
): void {
  ctx.save();

  ctx.font = `${UI_TOOLTIP_FONT_SIZE}px "Press Start 2P", Arial`;

  const lines = wrapText(ctx, text, UI_TOOLTIP_MAX_WIDTH);
  const lineHeight = UI_TOOLTIP_FONT_SIZE * 1.5;

  const textWidths = lines.map((line) => ctx.measureText(line).width);
  const maxTextWidth = Math.max(...textWidths);

  const boxWidth = maxTextWidth + UI_TOOLTIP_PADDING * 2;
  const boxHeight = lines.length * lineHeight + UI_TOOLTIP_PADDING * 2;

  const canvasWidth = ctx.canvas.width;
  const canvasHeight = ctx.canvas.height;

  // Horizontal positioning: center on mouse position, but clamp within screen
  let boxX = mousePosition.x - boxWidth / 2;
  boxX = Math.max(UI_PADDING, Math.min(canvasWidth - boxWidth - UI_PADDING, boxX));

  // Vertical positioning: decide whether to show above or below the button
  let boxY: number;
  if (fixedTooltipY !== undefined) {
    // Use fixed vertical position if provided
    boxY = fixedTooltipY - boxHeight;
  } else if (rect.y < canvasHeight / 2) {
    // Button is in the top half of the screen, show tooltip below it
    boxY = rect.y + rect.height - UI_TOOLTIP_OFFSET_Y;
  } else {
    // Button is in the bottom half of the screen, show tooltip above it
    boxY = rect.y - boxHeight + UI_TOOLTIP_OFFSET_Y;
  }

  // Clamp vertical position to stay within screen boundaries
  boxY = Math.max(UI_PADDING, Math.min(canvasHeight - boxHeight - UI_PADDING, boxY));

  // Draw background box
  ctx.fillStyle = UI_TOOLTIP_BACKGROUND_COLOR;
  ctx.fillRect(boxX, boxY, boxWidth, boxHeight);

  // Draw text lines
  ctx.fillStyle = UI_TOOLTIP_TEXT_COLOR;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  lines.forEach((line, index) => {
    ctx.fillText(line, boxX + UI_TOOLTIP_PADDING, boxY + UI_TOOLTIP_PADDING + index * lineHeight);
  });

  ctx.restore();
}

export function renderUIButtons(
  ctx: CanvasRenderingContext2D,
  gameState: GameWorldState,
  canvasWidth: number,
): {
  commandButtonsRect: Rect2D | null;
} {
  ctx.save();
  const player = findPlayerEntity(gameState);

  // --- Update Button State & Definitions ---
  // NOTE: We do NOT clear gameState.uiButtons here because renderTribeList (called before this)
  // adds buttons to the list. Clearing it here would remove them.
  // gameState.uiButtons = [];

  // 1. Define Top-Right System Buttons
  const systemButtons: ClickableUIButton[] = [
    {
      id: 'fastForwardButton',
      action: UIButtonActionType.FastForward,
      text: 'FFWD [T]',
      currentWidth: UI_BUTTON_WIDTH * 1.3,
      backgroundColor: UI_BUTTON_BACKGROUND_COLOR,
      textColor: UI_BUTTON_TEXT_COLOR,
      tooltip: 'Fast-forward time',
      rect: { x: 0, y: 0, width: 0, height: 0 },
    },
    {
      id: 'pauseButton',
      action: UIButtonActionType.TogglePause,
      text: gameState.isPaused ? `UN[P]AUSE` : `[P]AUSE`,
      backgroundColor: gameState.isPaused ? UI_BUTTON_ACTIVE_BACKGROUND_COLOR : UI_BUTTON_BACKGROUND_COLOR,
      currentWidth: gameState.isPaused ? UI_BUTTON_WIDTH * 1.4 : UI_BUTTON_WIDTH * 1.1,
      tooltip: gameState.isPaused ? 'Resume Game' : 'Pause Game',
      rect: { x: 0, y: 0, width: 0, height: 0 },
      textColor: UI_BUTTON_TEXT_COLOR,
    },
    {
      id: 'muteButton',
      action: UIButtonActionType.ToggleMute,
      text: gameState.isMuted ? `UN[M]UTE` : `[M]UTE`,
      backgroundColor: gameState.isMuted ? UI_BUTTON_ACTIVE_BACKGROUND_COLOR : UI_BUTTON_BACKGROUND_COLOR,
      tooltip: `Toggle Sound (${gameState.isMuted ? 'Muted' : 'Enabled'})`,
      currentWidth: UI_BUTTON_WIDTH,
      rect: { x: 0, y: 0, width: 0, height: 0 },
      textColor: UI_BUTTON_TEXT_COLOR,
    },
    {
      id: 'returnToIntroButton',
      action: UIButtonActionType.ReturnToIntro,
      text: 'EXIT',
      backgroundColor: UI_BUTTON_BACKGROUND_COLOR,
      tooltip: 'Return to Main Menu [ESC]',
      currentWidth: UI_BUTTON_WIDTH * 0.9,
      rect: { x: 0, y: 0, width: 0, height: 0 },
      textColor: UI_BUTTON_TEXT_COLOR,
    },
  ];
  gameState.uiButtons.push(...systemButtons);

  // 2. Strategy Button
  let commandButtonsRect: Rect2D | null = null;
  if (player) {
    const leader = player.leaderId
      ? (gameState.entities.entities[player.leaderId] as HumanEntity | undefined)
      : undefined;
    const currentObjective = leader?.tribeControl?.strategicObjective || StrategicObjective.None;
    const toggleIcon = gameState.strategicMenuOpen ? '🔼' : '🔽';

    let buttonText = '';
    if (currentObjective !== StrategicObjective.None) {
      const icon = getObjectiveIcon(currentObjective);
      const name = getObjectiveName(currentObjective).toUpperCase();
      buttonText = `${icon} ${name} (ACTIVE) ${toggleIcon}`;
    } else {
      buttonText = `🎖️ STRATEGY ${toggleIcon}`;
    }

    const strategyButtonWidth = 300;
    const strategyButtonHeight = UI_AUTOPILOT_BUTTON_SIZE;
    const buttonX = Math.floor((canvasWidth - strategyButtonWidth) / 2);
    const buttonY = ctx.canvas.height - strategyButtonHeight - 20;

    const strategyButton: ClickableUIButton = {
      id: 'commandButton_Strategy',
      action: UIButtonActionType.ToggleStrategicMenu,
      rect: { x: buttonX, y: buttonY, width: strategyButtonWidth, height: strategyButtonHeight },
      text: buttonText,
      backgroundColor: gameState.strategicMenuOpen ? UI_BUTTON_ACTIVE_BACKGROUND_COLOR : UI_BUTTON_BACKGROUND_COLOR,
      textColor: UI_BUTTON_TEXT_COLOR,
      currentWidth: strategyButtonWidth,
      tooltip: 'Strategic command',
      activated: gameState.strategicMenuOpen,
    };

    gameState.uiButtons.push(strategyButton);
    drawButton(ctx, strategyButton, gameState.hoveredButtonId === strategyButton.id);

    commandButtonsRect = {
      x: strategyButton.rect.x,
      y: strategyButton.rect.y,
      width: strategyButton.rect.width,
      height: strategyButton.rect.height,
    };
  }

  // --- Position and Draw All Buttons ---
  let currentButtonX = canvasWidth - UI_PADDING;
  systemButtons.forEach((button) => {
    const buttonY = UI_PADDING;
    const buttonX = currentButtonX - button.currentWidth;
    button.rect = { x: buttonX, y: buttonY, width: button.currentWidth, height: UI_BUTTON_HEIGHT };
    drawButton(ctx, button, gameState.hoveredButtonId === button.id);
    currentButtonX -= button.currentWidth + UI_BUTTON_SPACING;
  });

  ctx.restore();

  return {
    commandButtonsRect,
  };
}

export function renderGlobalTooltips(ctx: CanvasRenderingContext2D, gameState: GameWorldState): void {
  const hoveredButton = gameState.hoveredButtonId
    ? gameState.uiButtons.find((b) => b.id === gameState.hoveredButtonId)
    : undefined;

  if (hoveredButton && hoveredButton.tooltip && gameState.mousePosition) {
    renderUITooltip(
      ctx,
      hoveredButton.rect,
      hoveredButton.tooltip,
      gameState.mousePosition,
      hoveredButton.fixedTooltipY,
    );
  }
}
