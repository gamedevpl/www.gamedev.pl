import { GameWorldState } from './world-types';
import { UI_FONT_SIZE, UI_TEXT_SHADOW_BLUR, UI_TEXT_SHADOW_COLOR, UI_TEXT_COLOR } from './world-consts';
import { HumanEntity } from './entities/characters/human/human-types';
import { findChildren, findHeir, findPlayerEntity, getTribesInfo } from './utils/world-utils';
import { Vector2D } from './utils/math-types';
import { PlayerActionHint } from './ui/ui-types';
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
import { renderAutopilotIndicator } from './render/render-ui';

export function renderGame(
  ctx: CanvasRenderingContext2D,
  gameState: GameWorldState,
  isDebugOn: boolean,
  viewportCenter: Vector2D,
  playerActionHints: PlayerActionHint[],
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

  renderWorld(ctx, gameState, isDebugOn);

  // Render persistent autopilot command indicator
  renderAutopilotIndicator(ctx, gameState);

  ctx.restore(); // Restore context to draw UI in fixed positions

  if (!isIntro) {
    // --- UI Rendering ---
    ctx.fillStyle = UI_TEXT_COLOR;
    ctx.font = `${UI_FONT_SIZE}px "Press Start 2P", Arial`;
    ctx.shadowColor = UI_TEXT_SHADOW_COLOR;
    ctx.shadowBlur = UI_TEXT_SHADOW_BLUR;

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
    renderTribeList(ctx, tribesInfo, ctx.canvas.width, ctx.canvas.height);

    // --- Buttons & Tooltips ---
    renderUIButtons(ctx, gameState, ctx.canvas.width);

    // Reset shadow for other UI elements if needed
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;

    if (player) {
      if (gameState.autopilotControls.isActive) {
        renderAutopilotHints(ctx, gameState, viewportCenter, ctx.canvas.width, ctx.canvas.height);
      } else if (playerActionHints.length > 0) {
        renderPlayerActionHints(
          ctx,
          playerActionHints,
          player,
          viewportCenter,
          ctx.canvas.width,
          ctx.canvas.height,
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
    }

    // Render tutorial panel if active
    if (gameState.tutorialState.isActive) {
      renderTutorialPanel(ctx, gameState.tutorialState, gameState.tutorial, ctx.canvas.width, ctx.canvas.height);
    }

    if (gameState.isPaused) {
      renderPauseOverlay(ctx);
    }
  }
}
