import { DebugPanelType, GameWorldState } from './world-types';
import {
  UI_FONT_SIZE,
  UI_TEXT_SHADOW_BLUR,
  UI_TEXT_SHADOW_COLOR,
  UI_TEXT_COLOR,
  UI_NOTIFICATION_HIGHLIGHT_COLOR,
  UI_NOTIFICATION_HIGHLIGHT_PULSE_SPEED,
} from './ui/ui-consts.ts';
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
import { renderTopLeftPanel } from './render/ui/render-top-left-panel';
import { renderAutopilotHints } from './render/ui/render-autopilot-hints';
import { renderAutopilotIndicator } from './render/ui/render-autopilot-indicator';
import { renderEcosystemDebugger } from './render/render-ecosystem-debugger';
import { renderTribeDebugger } from './render/render-tribe-debugger';
import { renderBehaviorTreeDebugger } from './render/render-behavior-tree-debug';
import { renderNotifications } from './render/ui/render-notifications';
import { renderPerformanceDebugger } from './render/ui/render-performance-debugger';
import { renderExitConfirmation } from './render/ui/render-exit-confirmation';
import { renderGhostBuilding } from './render/render-building';
import { canPlaceBuilding } from './utils/building-placement-utils';
import { screenToWorldCoords } from './render/render-utils';
import { renderTribeRoleManager } from './render/ui/render-tribe-role-manager.ts';
import { renderArmyControl } from './render/ui/render-army-control.ts';
import { renderDepletedSoil } from './render/render-soil';
import { renderAllTerritories } from './render/render-territory';
import { renderSupplyChainDebugger } from './render/render-supply-chain-debugger.ts';

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

  const player = findPlayerEntity(gameState);

  // Render territory borders (before world entities so they appear behind)
  const borderLights = renderAllTerritories(ctx, gameState, viewportCenter, canvasDimensions, player?.leaderId);

  // Render depleted soil patches (under entities)
  renderDepletedSoil(ctx, gameState, viewportCenter, canvasDimensions);

  renderWorld(
    ctx,
    gameState,
    gameState.debugPanel === DebugPanelType.General,
    viewportCenter,
    canvasDimensions,
    borderLights,
  );

  // Render ghost building preview
  if (
    player &&
    gameState.selectedBuildingType &&
    gameState.selectedBuildingType !== 'removal' &&
    gameState.mousePosition
  ) {
    const worldPos = screenToWorldCoords(
      gameState.mousePosition,
      viewportCenter,
      canvasDimensions,
      gameState.mapDimensions,
    );
    const isValid = canPlaceBuilding(worldPos, gameState.selectedBuildingType, player.leaderId, gameState);
    renderGhostBuilding(ctx, worldPos, gameState.selectedBuildingType, isValid, gameState.mapDimensions);
  }

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

    let hungerBarRect: { x: number; y: number; width: number; height: number } | null = null;
    let foodBarRect: { x: number; y: number; width: number; height: number } | null = null;

    if (player) {
      const playerChildren = findChildren(gameState, player);
      const playerHeir = findHeir(playerChildren);
      const playerPartners =
        player.partnerIds
          ?.map((id) => gameState.entities.entities[id] as HumanEntity | undefined)
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
    if (gameState.tutorialState.activeUIHighlights.length > 0) {
      const { activeUIHighlights } = gameState.tutorialState;

      if (activeUIHighlights.includes(TutorialUIHighlightKey.HUNGER_BAR) && hungerBarRect) {
        renderUIElementHighlight(ctx, hungerBarRect, gameState.time);
      }

      if (activeUIHighlights.includes(TutorialUIHighlightKey.FOOD_BAR) && foodBarRect) {
        renderUIElementHighlight(ctx, foodBarRect, gameState.time);
      }

      if (activeUIHighlights.includes(TutorialUIHighlightKey.COMMAND_BUTTONS) && commandButtonsRect) {
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
      case DebugPanelType.Tribe:
        renderTribeDebugger(ctx, gameState, ctx.canvas.width, ctx.canvas.height);
        break;
      case DebugPanelType.SupplyChain:
        renderSupplyChainDebugger(ctx, gameState, ctx.canvas.width, ctx.canvas.height);
        break;
      case DebugPanelType.Performance:
        renderPerformanceDebugger(ctx, gameState, canvasDimensions.width);
        break;
      case DebugPanelType.General:
        renderBehaviorTreeDebugger(ctx, gameState, ctx.canvas.width, ctx.canvas.height);
        break;
    }

    // --- Tribe Role Manager ---
    if (gameState.roleManagerOpen && player && player.leaderId === player.id) {
      const roleManagerButtons = renderTribeRoleManager(ctx, gameState, player);
      gameState.uiButtons.push(...roleManagerButtons);
    }

    // --- Army Control Dialog ---
    if (gameState.armyControlOpen && player && player.leaderId === player.id) {
      const armyControlButtons = renderArmyControl(ctx, gameState, player);
      gameState.uiButtons.push(...armyControlButtons);
    }

    if (gameState.isPaused && gameState.exitConfirmation !== 'pending') {
      renderPauseOverlay(ctx);
    }

    if (gameState.exitConfirmation === 'pending') {
      renderExitConfirmation(ctx, gameState, ctx.canvas.width, ctx.canvas.height);
    }
  }
}
