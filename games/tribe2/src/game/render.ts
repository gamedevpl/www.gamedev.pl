import { DebugPanelType, GameWorldState } from './world-types';
import {
  UI_FONT_SIZE,
  UI_TEXT_SHADOW_BLUR,
  UI_TEXT_SHADOW_COLOR,
  UI_TEXT_COLOR,
  UI_NOTIFICATION_HIGHLIGHT_COLOR,
  UI_NOTIFICATION_HIGHLIGHT_PULSE_SPEED,
} from './ui-consts.ts';
import { HumanEntity } from './entities/characters/human/human-types';
import { findChildren, findHeir, findPlayerEntity, getTribesInfo } from './utils';
import { Vector2D } from './utils/math-types';
import { PlayerActionHint, UIButtonActionType } from './ui/ui-types';
import { TutorialUIHighlightKey } from './tutorial/tutorial-types';
import { renderUIButtons } from './render/ui/render-buttons';
import { renderPauseOverlay } from './render/ui/render-pause-overlay';
import { renderPlayerActionHints } from './render/ui/render-player-hints';
import { renderTribeList } from './render/ui/render-tribe-list';
import { renderTutorialPanel, renderUIElementHighlight } from './render/ui/render-tutorial';
import { renderGameOverScreen } from './render/render-game-over';
import { renderWorld } from './render/render-world';
import { renderBuildingPreview } from './render/render-building';
import { renderTopLeftPanel } from './render/ui/render-top-left-panel';
import { renderAutopilotHints } from './render/ui/render-autopilot-hints';
import { renderAutopilotIndicator } from './render/ui/render-autopilot-indicator';
import { renderEcosystemDebugger } from './render/render-ecosystem-debugger';
import { renderNotifications } from './render/ui/render-notifications';
import { renderPerformanceDebugger } from './render/ui/render-performance-debugger';
import { renderExitConfirmation } from './render/ui/render-exit-confirmation';

export function renderGame(
  ctx: CanvasRenderingContext2D,
  gameState: GameWorldState,
  viewportCenter: Vector2D,
  playerActionHints: PlayerActionHint[],
  canvasDimensions: { width: number; height: number },
  isIntro: boolean = false,
): void {
  ctx.save();
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  ctx.fillStyle = '#2c5234';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  ctx.translate(ctx.canvas.width / 2 - viewportCenter.x, ctx.canvas.height / 2 - viewportCenter.y);

  if (!isIntro && gameState.gameOver) {
    ctx.restore(); // Restore before drawing UI
    renderGameOverScreen(ctx, gameState);
    return;
  }

  renderWorld(ctx, gameState, gameState.debugPanel === DebugPanelType.General, viewportCenter, canvasDimensions);

  // Render building preview if in placement mode
  renderBuildingPreview(ctx, gameState, viewportCenter, canvasDimensions, gameState.mapDimensions);

  // --- Notification Area Highlights ---
  const activeNotifications = gameState.notifications.filter((n) => !n.isDismissed);
  for (const notification of activeNotifications) {
    const pulse = (Math.sin(gameState.time * UI_NOTIFICATION_HIGHLIGHT_PULSE_SPEED) + 1) / 2; // 0 to 1 pulse
    ctx.globalAlpha = pulse * 0.5 + 0.25; // Pulsing alpha
    ctx.fillStyle = UI_NOTIFICATION_HIGHLIGHT_COLOR;

    if (notification.targetArea) {
      ctx.fillRect(
        notification.targetArea.x,
        notification.targetArea.y,
        notification.targetArea.width,
        notification.targetArea.height,
      );
    }
    if (notification.targetRadius) {
      ctx.beginPath();
      ctx.arc(
        notification.targetRadius.x,
        notification.targetRadius.y,
        notification.targetRadius.radius,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1; // Reset alpha

  // Render persistent autopilot command indicator
  renderAutopilotIndicator(ctx, gameState);

  ctx.restore(); // Restore context to draw UI in fixed positions

  if (!isIntro) {
    // --- UI Rendering ---
    ctx.fillStyle = UI_TEXT_COLOR;
    ctx.font = `${UI_FONT_SIZE}px "Press Start 2P", Arial`;
    ctx.shadowColor = UI_TEXT_SHADOW_COLOR;
    ctx.shadowBlur = UI_TEXT_SHADOW_BLUR;

    // Reset UI buttons for this frame
    gameState.uiButtons = [];

    const player = findPlayerEntity(gameState);
    let hungerBarRect: { x: number; y: number; width: number; height: number } | null = null;
    let foodBarRect: { x: number; y: number; width: number; height: number } | null = null;

    if (player) {
      const playerChildren = findChildren(gameState, player);
      const playerHeir = findHeir(playerChildren);
      const playerPartners =
        player.partnerIds
          ?.map((id) => gameState.entities.entities.get(id) as HumanEntity | undefined)
          .filter((p): p is HumanEntity => p !== undefined) || [];

      const panelRects = renderTopLeftPanel(ctx, gameState, player, playerHeir, playerPartners, playerChildren);
      hungerBarRect = panelRects.hungerBarRect;
      foodBarRect = panelRects.foodBarRect;
    }

    // --- Bottom-Left UI (Tribe List) ---
    const tribesInfo = getTribesInfo(gameState, player?.leaderId);
    renderTribeList(ctx, gameState, tribesInfo, ctx.canvas.width, ctx.canvas.height);

    // --- Buttons & Tooltips ---
    const { commandButtonsRect } = renderUIButtons(ctx, gameState, ctx.canvas.width);

    // Reset shadow for other UI elements if needed
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;

    if (player) {
      renderAutopilotHints(ctx, gameState, viewportCenter, ctx.canvas.width, ctx.canvas.height);
      if (playerActionHints.length > 0) {
        renderPlayerActionHints(
          ctx,
          playerActionHints,
          player,
          viewportCenter,
          ctx.canvas.width,
          ctx.canvas.height,
          gameState.mapDimensions,
        );
      }
    }

    // --- UI Highlights ---
    if (gameState.tutorialState.activeUIHighlights.size > 0) {
      const { activeUIHighlights } = gameState.tutorialState;

      if (activeUIHighlights.has(TutorialUIHighlightKey.HUNGER_BAR) && hungerBarRect) {
        renderUIElementHighlight(ctx, hungerBarRect, gameState.time);
      }

      if (activeUIHighlights.has(TutorialUIHighlightKey.FOOD_BAR) && foodBarRect) {
        renderUIElementHighlight(ctx, foodBarRect, gameState.time);
      }

      if (activeUIHighlights.has(TutorialUIHighlightKey.COMMAND_BUTTONS) && commandButtonsRect) {
        renderUIElementHighlight(ctx, commandButtonsRect, gameState.time);
      }
    }

    // Render tutorial panel if active
    if (gameState.tutorialState.isActive) {
      const dismissButtonRect = renderTutorialPanel(ctx, gameState, ctx.canvas.width, ctx.canvas.height);
      if (dismissButtonRect) {
        gameState.uiButtons.push({
          id: 'tutorial-dismiss',
          action: UIButtonActionType.DismissTutorial,
          rect: dismissButtonRect,
          text: '',
          currentWidth: dismissButtonRect.width,
          backgroundColor: 'transparent',
          textColor: 'transparent',
        });
      }
    }

    // --- Notifications Panel ---
    renderNotifications(ctx, gameState, ctx.canvas.width, ctx.canvas.height);

    // --- Debug Panels ---
    switch (gameState.debugPanel) {
      case DebugPanelType.Ecosystem:
        renderEcosystemDebugger(ctx, gameState, ctx.canvas.width, ctx.canvas.height);
        break;
      case DebugPanelType.Performance:
        renderPerformanceDebugger(ctx, gameState, canvasDimensions.width);
        break;
    }

    if (gameState.isPaused && gameState.exitConfirmation !== 'pending') {
      renderPauseOverlay(ctx);
    }

    if (gameState.exitConfirmation === 'pending') {
      renderExitConfirmation(ctx, gameState, ctx.canvas.width, ctx.canvas.height);
    }
  }
}
