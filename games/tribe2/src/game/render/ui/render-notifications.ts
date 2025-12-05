import { GameWorldState } from '../../world-types';
import {
  UI_NOTIFICATION_PANEL_WIDTH,
  UI_NOTIFICATION_PANEL_PADDING,
  UI_NOTIFICATION_PANEL_BACKGROUND_COLOR,
  UI_NOTIFICATION_TEXT_COLOR,
  UI_NOTIFICATION_TEXT_FONT_SIZE,
  UI_NOTIFICATION_SPACING,
  UI_NOTIFICATION_DISMISS_BUTTON_SIZE,
  UI_NOTIFICATION_DISMISS_BUTTON_COLOR,
  UI_NOTIFICATION_VIEW_BUTTON_COLOR,
  UI_NOTIFICATION_PANEL_BORDER_RADIUS,
  UI_NOTIFICATION_SLIDE_IN_DURATION_MS,
  UI_NOTIFICATION_AREA_PADDING_BOTTOM,
  UI_NOTIFICATION_BUTTON_HOVER_COLOR,
} from '../../ui/ui-consts.ts';
import { Rect } from '../../notifications/notification-types';

/**
 * Wraps text to fit within a max width and calculates the required height.
 * @returns The total height of the wrapped text.
 */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  render: boolean = true,
): number {
  const words = text.split(' ');
  let line = '';
  const lines = [];

  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + ' ';
    const metrics = ctx.measureText(testLine);
    const testWidth = metrics.width;
    if (testWidth > maxWidth && n > 0) {
      lines.push(line);
      line = words[n] + ' ';
    } else {
      line = testLine;
    }
  }
  lines.push(line);

  if (render) {
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], x, y + i * lineHeight);
    }
  }

  return lines.length * lineHeight;
}

// Easing function for a smooth animation
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Renders all active notifications with a slide-in animation from the bottom and creates
 * clickable areas for their buttons. The layout is now bottom-up.
 */
export function renderNotifications(
  ctx: CanvasRenderingContext2D,
  gameState: GameWorldState,
  canvasWidth: number,
  canvasHeight: number,
): void {
  // Clear the button rects from the previous frame
  gameState.notificationButtonRects = { dismiss: {}, view: {} };

  const activeNotifications = gameState.notifications.filter((n) => !n.isDismissed);
  if (activeNotifications.length === 0) {
    return;
  }

  ctx.save();

  // Start rendering from the bottom of the screen, leaving space for command buttons
  let yOffset = canvasHeight - UI_NOTIFICATION_AREA_PADDING_BOTTOM;

  for (const notification of activeNotifications) {
    const panelX = canvasWidth - UI_NOTIFICATION_PANEL_WIDTH - UI_NOTIFICATION_PANEL_PADDING;

    // --- Calculate dynamic height ---
    ctx.font = `${UI_NOTIFICATION_TEXT_FONT_SIZE}px "Press Start 2P", Arial`;
    const textX = panelX + UI_NOTIFICATION_PANEL_PADDING;
    const textMaxWidth = UI_NOTIFICATION_PANEL_WIDTH - UI_NOTIFICATION_PANEL_PADDING * 2;
    const textHeight = wrapText(
      ctx,
      notification.message,
      -9999,
      -9999,
      textMaxWidth,
      UI_NOTIFICATION_TEXT_FONT_SIZE * 1.2,
      false,
    );
    const panelHeight = UI_NOTIFICATION_PANEL_PADDING * 2 + textHeight + UI_NOTIFICATION_DISMISS_BUTTON_SIZE;

    const finalPanelY = yOffset - panelHeight;

    // --- Animation Calculation ---
    const timeSinceCreation = Date.now() - notification.creationTime;
    const animationProgress = Math.min(timeSinceCreation / UI_NOTIFICATION_SLIDE_IN_DURATION_MS, 1);
    const easedProgress = easeOutCubic(animationProgress);

    // Interpolate Y position from off-screen (bottom) to final position
    const startY = canvasHeight;
    const currentPanelY = startY + (finalPanelY - startY) * easedProgress;

    // --- Draw Panel ---
    ctx.fillStyle = UI_NOTIFICATION_PANEL_BACKGROUND_COLOR;
    ctx.beginPath();
    ctx.roundRect(panelX, currentPanelY, UI_NOTIFICATION_PANEL_WIDTH, panelHeight, UI_NOTIFICATION_PANEL_BORDER_RADIUS);
    ctx.fill();

    // --- Draw Text ---
    ctx.fillStyle = UI_NOTIFICATION_TEXT_COLOR;
    ctx.textBaseline = 'top';
    wrapText(
      ctx,
      notification.message,
      textX,
      currentPanelY + UI_NOTIFICATION_PANEL_PADDING,
      textMaxWidth,
      UI_NOTIFICATION_TEXT_FONT_SIZE * 1.2,
      true,
    );

    // --- Draw and Store Buttons ---
    const buttonsY =
      currentPanelY + panelHeight - UI_NOTIFICATION_DISMISS_BUTTON_SIZE - UI_NOTIFICATION_PANEL_PADDING / 2;

    // Dismiss Button ('X')
    const dismissX =
      panelX + UI_NOTIFICATION_PANEL_WIDTH - UI_NOTIFICATION_DISMISS_BUTTON_SIZE - UI_NOTIFICATION_PANEL_PADDING / 2;
    const dismissRect: Rect = {
      x: dismissX,
      y: buttonsY,
      width: UI_NOTIFICATION_DISMISS_BUTTON_SIZE,
      height: UI_NOTIFICATION_DISMISS_BUTTON_SIZE,
    };
    if (gameState.notificationButtonRects) {
      gameState.notificationButtonRects.dismiss[notification.id] = dismissRect;
    }

    const isDismissHovered = gameState.hoveredButtonId === `notification-dismiss-${notification.id}`;
    ctx.fillStyle = isDismissHovered ? UI_NOTIFICATION_BUTTON_HOVER_COLOR : UI_NOTIFICATION_DISMISS_BUTTON_COLOR;
    ctx.font = `${UI_NOTIFICATION_DISMISS_BUTTON_SIZE}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('✖', dismissRect.x + dismissRect.width / 2, dismissRect.y + dismissRect.height / 2);

    // View Button (if applicable)
    const hasTarget =
      notification.targetEntityIds ||
      notification.targetPosition ||
      notification.targetArea ||
      notification.targetRadius;
    if (hasTarget) {
      const viewX = dismissX - UI_NOTIFICATION_DISMISS_BUTTON_SIZE - UI_NOTIFICATION_SPACING;
      const viewRect: Rect = {
        x: viewX,
        y: buttonsY,
        width: UI_NOTIFICATION_DISMISS_BUTTON_SIZE,
        height: UI_NOTIFICATION_DISMISS_BUTTON_SIZE,
      };
      if (gameState.notificationButtonRects) {
        gameState.notificationButtonRects.view[notification.id] = viewRect;
      }

      const isViewHovered = gameState.hoveredButtonId === `notification-view-${notification.id}`;
      ctx.fillStyle = isViewHovered ? UI_NOTIFICATION_BUTTON_HOVER_COLOR : UI_NOTIFICATION_VIEW_BUTTON_COLOR;
      ctx.font = `${UI_NOTIFICATION_DISMISS_BUTTON_SIZE * (isViewHovered ? 1.5 : 1.2)}px Arial`; // Eye emoji
      ctx.fillText('👁️', viewRect.x + viewRect.width / 2, viewRect.y + viewRect.height / 2);
    }

    // Update yOffset for the next notification to stack on top
    yOffset -= panelHeight + UI_NOTIFICATION_SPACING;
  }

  ctx.restore();
}
