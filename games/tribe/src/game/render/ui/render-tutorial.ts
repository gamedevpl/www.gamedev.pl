import { GameWorldState } from '../../world-types';
import { TransitionState } from '../../tutorial/tutorial-types.js';
import {
  UI_TUTORIAL_DISMISS_BUTTON_COLOR,
  UI_TUTORIAL_DISMISS_BUTTON_HOVER_COLOR,
  UI_TUTORIAL_DISMISS_BUTTON_PADDING,
  UI_TUTORIAL_DISMISS_BUTTON_SIZE,
  UI_TUTORIAL_HIGHLIGHT_COLOR,
  UI_TUTORIAL_HIGHLIGHT_LINE_WIDTH,
  UI_TUTORIAL_HIGHLIGHT_PADDING,
  UI_TUTORIAL_HIGHLIGHT_PULSE_SPEED,
  UI_TUTORIAL_PANEL_BACKGROUND_COLOR,
  UI_TUTORIAL_PANEL_BORDER_RADIUS,
  UI_TUTORIAL_PANEL_PADDING,
  UI_TUTORIAL_PANEL_TEXT_COLOR,
  UI_TUTORIAL_PANEL_WIDTH,
  UI_TUTORIAL_TEXT_FONT_SIZE,
  UI_TUTORIAL_TITLE_FONT_SIZE,
} from '../../world-consts';

function renderDismissButton(
  ctx: CanvasRenderingContext2D,
  panelX: number,
  panelY: number,
  panelWidth: number,
  isHovered: boolean,
) {
  const buttonSize = UI_TUTORIAL_DISMISS_BUTTON_SIZE;
  const buttonPadding = UI_TUTORIAL_DISMISS_BUTTON_PADDING;
  const buttonX = panelX + panelWidth - buttonSize - buttonPadding;
  const buttonY = panelY + buttonPadding;

  ctx.save();
  ctx.lineWidth = 2;
  ctx.strokeStyle = isHovered ? UI_TUTORIAL_DISMISS_BUTTON_HOVER_COLOR : UI_TUTORIAL_DISMISS_BUTTON_COLOR;

  ctx.beginPath();
  const offset = 5;
  ctx.moveTo(buttonX + offset, buttonY + offset);
  ctx.lineTo(buttonX + buttonSize - offset, buttonY + buttonSize - offset);
  ctx.moveTo(buttonX + buttonSize - offset, buttonY + offset);
  ctx.lineTo(buttonX + offset, buttonY + buttonSize - offset);
  ctx.stroke();
  ctx.restore();
}

export function renderTutorialPanel(
  ctx: CanvasRenderingContext2D,
  gameState: GameWorldState,
  canvasWidth: number,
  canvasHeight: number,
): { x: number; y: number; width: number; height: number } | undefined {
  const { tutorialState, tutorial } = gameState;

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

  // --- Calculate text wrapping and panel height --
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
  const panelY = canvasHeight - panelHeight - 160;

  // --- Draw panel background --
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

  // --- Draw text --
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

  // --- Draw Dismiss Button ---
  const isHovered = gameState.hoveredButtonId === 'tutorial-dismiss';
  renderDismissButton(ctx, panelX, panelY, panelWidth, isHovered);

  ctx.restore();

  const buttonSize = UI_TUTORIAL_DISMISS_BUTTON_SIZE;
  const buttonPadding = UI_TUTORIAL_DISMISS_BUTTON_PADDING;
  const buttonX = panelX + panelWidth - buttonSize - buttonPadding;
  const buttonY = panelY + buttonPadding;

  return { x: buttonX, y: buttonY, width: buttonSize, height: buttonSize };
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
