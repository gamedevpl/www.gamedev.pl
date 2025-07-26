import {
  UI_AUTOPILOT_BUTTON_SIZE,
  UI_AUTOPILOT_BUTTON_SPACING,
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
  UI_TOOLTIP_OFFSET_Y,
  UI_TOOLTIP_PADDING,
  UI_TOOLTIP_TEXT_COLOR,
} from '../../world-consts';
import { AutopilotControls, GameWorldState } from '../../world-types.js';
import { ClickableUIButton, PlayerActionType, PLAYER_ACTION_EMOJIS, UIButtonActionType } from '../../ui/ui-types';
import { Rect2D, Vector2D } from '../../utils/math-types';
import { findPlayerEntity, getAvailablePlayerActions } from '../../utils/world-utils';

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

function renderTooltip(ctx: CanvasRenderingContext2D, rect: Rect2D, text: string, mousePosition: Vector2D): void {
  ctx.save();

  ctx.font = `${UI_TOOLTIP_FONT_SIZE}px "Press Start 2P", Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';

  const textMetrics = ctx.measureText(text);
  const textWidth = textMetrics.width;
  const textHeight = UI_TOOLTIP_FONT_SIZE;

  const boxWidth = textWidth + UI_TOOLTIP_PADDING * 2;
  const boxHeight = textHeight + UI_TOOLTIP_PADDING * 2;
  const boxX = mousePosition.x - boxWidth / 2;
  const canvasHeight = ctx.canvas.height;
  const boxY =
    rect.y < canvasHeight / 2 ? rect.y + rect.height - UI_TOOLTIP_OFFSET_Y : rect.y - boxHeight + UI_TOOLTIP_OFFSET_Y;

  ctx.fillStyle = UI_TOOLTIP_BACKGROUND_COLOR;
  ctx.fillRect(boxX, boxY, boxWidth, boxHeight);

  ctx.fillStyle = UI_TOOLTIP_TEXT_COLOR;
  ctx.fillText(text, mousePosition.x, boxY + boxHeight / 2 + textHeight / 2);

  ctx.restore();
}

export function renderUIButtons(ctx: CanvasRenderingContext2D, gameState: GameWorldState, canvasWidth: number): void {
  ctx.save();
  const player = findPlayerEntity(gameState);

  // --- Update Button State & Definitions ---
  // This section modifies the buttons in the gameState before drawing.
  gameState.uiButtons = []; // Clear old buttons to redefine them

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
  ];
  gameState.uiButtons.push(...systemButtons);

  // 2. Update and define Player Action Buttons
  if (player) {
    const availableActions = getAvailablePlayerActions(gameState, player);
    const availableActionTypes = new Set(availableActions.map((a) => a.type));

    let playerCommandButtons: {
      playerAction: PlayerActionType;
      buttonAction: UIButtonActionType;
      shortcut: string;
      name: string;
      toggleKey?: keyof AutopilotControls['behaviors'];
      condition?: () => boolean;
    }[] = [
      {
        playerAction: PlayerActionType.Gather,
        buttonAction: UIButtonActionType.CommandGather,
        shortcut: 'E',
        name: 'Gather',
        toggleKey: 'gathering',
        condition: () => player.isAdult === true,
      },
      { playerAction: PlayerActionType.Eat, buttonAction: UIButtonActionType.CommandEat, shortcut: 'F', name: 'Eat' },
      {
        playerAction: PlayerActionType.Plant,
        buttonAction: UIButtonActionType.CommandPlant,
        shortcut: 'B',
        name: 'Plant',
        toggleKey: 'planting',
        condition: () => player.isAdult === true,
      },
      {
        playerAction: PlayerActionType.Procreate,
        buttonAction: UIButtonActionType.ToggleProcreationBehavior,
        shortcut: 'R',
        name: 'Procreation',
        toggleKey: 'procreation',
        condition: () => player.isAdult === true,
      },
      {
        playerAction: PlayerActionType.FeedChildren,
        buttonAction: UIButtonActionType.ToggleFeedChildrenBehavior,
        shortcut: 'H',
        name: 'Feed Children',
        toggleKey: 'feedChildren',
        condition: () => player.isAdult === true,
      },
      {
        playerAction: PlayerActionType.Attack,
        buttonAction: UIButtonActionType.ToggleAttackBehavior,
        shortcut: 'Q',
        name: 'Attack',
        toggleKey: 'attack',
        condition: () => player.isAdult === true,
      },
      {
        playerAction: PlayerActionType.FollowMe,
        buttonAction: UIButtonActionType.CommandFollowMe,
        shortcut: 'C',
        name: 'Follow Me',
        toggleKey: 'followLeader',
        condition: () => player.isAdult === true,
      },
      {
        playerAction: PlayerActionType.CallToAttack,
        buttonAction: UIButtonActionType.CommandCallToAttack,
        shortcut: 'V',
        name: 'Call to Attack',
        condition: () => player.isAdult === true,
      },
      {
        playerAction: PlayerActionType.TribeSplit,
        buttonAction: UIButtonActionType.CommandTribeSplit,
        shortcut: 'K',
        name: 'Split Tribe',
        condition: () => player.leaderId !== undefined && player.leaderId !== player.id && player.isAdult === true,
      },
    ];

    playerCommandButtons = playerCommandButtons.filter((b) => (b.condition ? b.condition() : true));

    const rows = 1;
    const cols = playerCommandButtons.length;
    const totalWidth = cols * UI_AUTOPILOT_BUTTON_SIZE + (cols - 1) * UI_AUTOPILOT_BUTTON_SPACING;
    const totalHeight = rows * UI_AUTOPILOT_BUTTON_SIZE + (rows - 1) * UI_AUTOPILOT_BUTTON_SPACING;
    const startX = (canvasWidth - totalWidth) / 2;
    const startY = ctx.canvas.height - totalHeight - 20;

    playerCommandButtons.forEach((behavior, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const buttonX = startX + col * (UI_AUTOPILOT_BUTTON_SIZE + UI_AUTOPILOT_BUTTON_SPACING);
      const buttonY = startY + row * (UI_AUTOPILOT_BUTTON_SIZE + UI_AUTOPILOT_BUTTON_SPACING);

      const isToggleButton = !!behavior.toggleKey;
      const isBehaviorActive = isToggleButton && gameState.autopilotControls.behaviors[behavior.toggleKey!];
      const isDisabled = !availableActionTypes.has(behavior.playerAction);

      const shiftTooltip = !gameState.hasPlayerEnabledAutopilot ? ' (Press Shift to toggle Auto)' : '';
      const tooltipText = isToggleButton ? `${behavior.name}${shiftTooltip}` : behavior.name;

      const backgroundColor = isBehaviorActive ? UI_BUTTON_ACTIVE_BACKGROUND_COLOR : UI_BUTTON_BACKGROUND_COLOR;

      const button: ClickableUIButton = {
        id: `commandButton_${behavior.name}`,
        action: behavior.buttonAction,
        rect: { x: buttonX, y: buttonY, width: UI_AUTOPILOT_BUTTON_SIZE, height: UI_AUTOPILOT_BUTTON_SIZE },
        icon: PLAYER_ACTION_EMOJIS[behavior.playerAction],
        text: behavior.shortcut,
        backgroundColor: backgroundColor,
        textColor: UI_BUTTON_TEXT_COLOR,
        currentWidth: UI_AUTOPILOT_BUTTON_SIZE,
        tooltip: tooltipText,
        isDisabled,
        activated: isBehaviorActive,
      };
      gameState.uiButtons.push(button);
    });
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

  gameState.uiButtons
    .filter((b) => b.id.startsWith('commandButton_'))
    .forEach((button) => {
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
