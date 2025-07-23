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
  ctx.fillStyle = button.backgroundColor;

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

  if (isHovered) {
    ctx.fillStyle = UI_BUTTON_HOVER_BACKGROUND_COLOR;
    ctx.globalAlpha = 0.5; // Slightly transparent hover effect
    ctx.fill();
    ctx.globalAlpha = 1; // Reset alpha for text/icon rendering
  }

  // --- Generic rendering logic for icon and text ---
  ctx.fillStyle = button.textColor;

  if (button.icon) {
    // Render large icon in the center
    ctx.font = `${height * 0.55}px "Press Start 2P", Arial`; // Icon size relative to button height
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(button.icon, x + width / 2, y + height / 2);

    // Render small text in the bottom right corner
    if (button.text) {
      ctx.font = `${height * 0.18}px "Press Start 2P", Arial`; // Smaller font for the key hint
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      // Adjust padding for corner text
      ctx.fillText(button.text, x + width - 4, y + height - 2);
    }
  } else {
    // Original behavior for text-only buttons
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(button.text, x + width / 2, y + height / 2);
  }

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
  // Remove all old behavior buttons before adding new ones
  gameState.uiButtons = gameState.uiButtons.filter(
    (btn) =>
      ![
        UIButtonActionType.ToggleProcreationBehavior,
        UIButtonActionType.TogglePlantingBehavior,
        UIButtonActionType.ToggleGatheringBehavior,
        UIButtonActionType.ToggleAttackBehavior,
        UIButtonActionType.ToggleCallToAttackBehavior,
        UIButtonActionType.ToggleFeedChildrenBehavior,
      ].includes(btn.action),
  );

  if (gameState.autopilotControls.isActive) {
    const behaviors: {
      key: keyof typeof gameState.autopilotControls.behaviors;
      action: UIButtonActionType;
      emoji: PlayerActionType;
      shortcut: string;
      name: string;
    }[] = [
      {
        key: 'gathering',
        action: UIButtonActionType.ToggleGatheringBehavior,
        emoji: PlayerActionType.GatherFood,
        shortcut: 'G',
        name: 'Gathering',
      },
      {
        key: 'attack',
        action: UIButtonActionType.ToggleAttackBehavior,
        emoji: PlayerActionType.Attack,
        shortcut: 'Q',
        name: 'Attack',
      },
      {
        key: 'callToAttack',
        action: UIButtonActionType.ToggleCallToAttackBehavior,
        emoji: PlayerActionType.CallToAttack,
        shortcut: 'V',
        name: 'Call to Attack',
      },
      {
        key: 'procreation',
        action: UIButtonActionType.ToggleProcreationBehavior,
        emoji: PlayerActionType.Procreate,
        shortcut: 'R',
        name: 'Procreation',
      },
      {
        key: 'planting',
        action: UIButtonActionType.TogglePlantingBehavior,
        emoji: PlayerActionType.PlantBush,
        shortcut: 'B',
        name: 'Planting',
      },
      {
        key: 'feedChildren',
        action: UIButtonActionType.ToggleFeedChildrenBehavior,
        emoji: PlayerActionType.FeedChildren,
        shortcut: 'H',
        name: 'Feed Children',
      },
    ];

    const cols = 3;
    const rows = 2;
    const totalWidth = cols * UI_AUTOPILOT_BUTTON_SIZE + (cols - 1) * UI_AUTOPILOT_BUTTON_SPACING;
    const totalHeight = rows * UI_AUTOPILOT_BUTTON_SIZE + (rows - 1) * UI_AUTOPILOT_BUTTON_SPACING;
    const startX = (canvasWidth - totalWidth) / 2;
    const startY = canvasHeight - totalHeight - 20;

    behaviors.forEach((behavior, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const buttonX = startX + col * (UI_AUTOPILOT_BUTTON_SIZE + UI_AUTOPILOT_BUTTON_SPACING);
      const buttonY = startY + row * (UI_AUTOPILOT_BUTTON_SIZE + UI_AUTOPILOT_BUTTON_SPACING);

      const isBehaviorActive = gameState.autopilotControls.behaviors[behavior.key];
      const button: ClickableUIButton = {
        id: `toggle${behavior.name}Button`,
        action: behavior.action,
        rect: {
          x: buttonX,
          y: buttonY,
          width: UI_AUTOPILOT_BUTTON_SIZE,
          height: UI_AUTOPILOT_BUTTON_SIZE,
        },
        icon: PLAYER_ACTION_EMOJIS[behavior.emoji],
        text: behavior.shortcut,
        backgroundColor: isBehaviorActive ? UI_BUTTON_ACTIVE_BACKGROUND_COLOR : UI_BUTTON_BACKGROUND_COLOR,
        textColor: UI_BUTTON_TEXT_COLOR,
        currentWidth: UI_AUTOPILOT_BUTTON_SIZE,
        tooltip: `${behavior.name}: ${isBehaviorActive ? 'ON' : 'OFF'}`,
      };
      gameState.uiButtons.push(button);
    });
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
    .filter((b) =>
      [
        UIButtonActionType.ToggleProcreationBehavior,
        UIButtonActionType.TogglePlantingBehavior,
        UIButtonActionType.ToggleGatheringBehavior,
        UIButtonActionType.ToggleAttackBehavior,
        UIButtonActionType.ToggleCallToAttackBehavior,
        UIButtonActionType.ToggleFeedChildrenBehavior,
      ].includes(b.action),
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
