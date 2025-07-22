import { GameWorldState } from './world-types';
import {
  UI_FONT_SIZE,
  UI_PADDING,
  UI_TEXT_SHADOW_BLUR,
  UI_TEXT_SHADOW_COLOR,
  UI_BAR_WIDTH,
  UI_BAR_HEIGHT,
  UI_BAR_PADDING,
  UI_BAR_BACKGROUND_COLOR,
  UI_HUNGER_BAR_COLOR,
  UI_AGE_BAR_COLOR,
  HUMAN_MAX_AGE_YEARS,
  UI_BERRY_ICON_SIZE,
  UI_TIME_BAR_COLOR,
  HOURS_PER_GAME_DAY,
  GAME_DAY_IN_REAL_SECONDS,
  HUMAN_YEAR_IN_REAL_SECONDS,
  UI_MINIATURE_CHARACTER_SIZE,
  UI_FAMILY_MEMBER_ICON_SIZE,
  UI_HITPOINTS_BAR_COLOR,
  HUMAN_HUNGER_DEATH,
  UI_TUTORIAL_HIGHLIGHT_COLOR,
  UI_TUTORIAL_HIGHLIGHT_RADIUS,
  UI_TEXT_COLOR,
} from './world-consts';
import { renderBerryBush } from './render/render-bush';
import { BerryBushEntity } from './entities/plants/berry-bush/berry-bush-types';
import { Entity, EntityId } from './entities/entities-types';
import { renderHumanCorpse } from './render/render-human-corpse';
import { HumanCorpseEntity } from './entities/characters/human/human-corpse-types';
import { renderCharacter } from './render/render-character';
import { HumanEntity } from './entities/characters/human/human-types';
import { findChildren, findHeir, findPlayerEntity, getTribesInfo } from './utils/world-utils';
import { renderVisualEffect } from './render/render-effects';
import { Vector2D } from './utils/math-types';
import { VisualEffect } from './visual-effects/visual-effect-types';
import { PlayerActionHint, UIStatusType, UI_STATUS_EMOJIS } from './ui/ui-types';
import { TutorialUIHighlightKey } from './tutorial/tutorial-types';
import { drawFoodBar, drawProgressBar } from './render/ui/render-bars';
import { renderUIButtons } from './render/ui/render-buttons';
import { drawFamilyMemberBar, renderMiniatureCharacter } from './render/ui/render-characters-ui';
import { renderPauseOverlay } from './render/ui/render-pause-overlay';
import { renderPlayerActionHints } from './render/ui/render-player-hints';
import { renderTribeList } from './render/ui/render-tribe-list';
import { renderTutorialHighlight, renderTutorialPanel, renderUIElementHighlight } from './render/ui/render-tutorial';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderWithWrapping(
  ctx: CanvasRenderingContext2D,
  worldWidth: number,
  worldHeight: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  renderFn: (ctx: CanvasRenderingContext2D, ...args: any[]) => void,
  entity: Entity | VisualEffect,
  ...args: unknown[]
): void {
  const originalPosition = { ...entity.position };

  for (let dy = -worldHeight; dy <= worldHeight; dy += worldHeight) {
    for (let dx = -worldWidth; dx <= worldWidth; dx += worldWidth) {
      entity.position.x = originalPosition.x + dx;
      entity.position.y = originalPosition.y + dy;
      renderFn(ctx, entity, ...args);
    }
  }

  entity.position = originalPosition;
}

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
    ctx.fillStyle = 'white';
    ctx.font = '30px "Press Start 2P", Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Game Over!', ctx.canvas.width / 2, ctx.canvas.height / 2 - 60);
    ctx.font = '20px "Press Start 2P", Arial';
    ctx.fillText(`Lineage Extinct.`, ctx.canvas.width / 2, ctx.canvas.height / 2 - 20);
    ctx.fillText(`Cause: ${gameState.causeOfGameOver || 'Unknown'}`, ctx.canvas.width / 2, ctx.canvas.height / 2 + 20);
    return;
  }

  const player = findPlayerEntity(gameState);
  const playerChildren = player ? findChildren(gameState, player) : [];
  const playerHeir = findHeir(playerChildren);
  const playerPartners =
    player?.partnerIds
      ?.map((id) => gameState.entities.entities.get(id) as HumanEntity | undefined)
      .filter((p): p is HumanEntity => p !== undefined) || [];

  const { width: worldWidth, height: worldHeight } = gameState.mapDimensions;

  const sortedEntities = Array.from(gameState.entities.entities.values()).sort(
    (a, b) => a.position.y - b.position.y || a.id - b.id,
  );

  sortedEntities.forEach((entity: Entity) => {
    if (entity.type === 'berryBush') {
      renderWithWrapping(
        ctx,
        worldWidth,
        worldHeight,
        renderBerryBush,
        entity as BerryBushEntity,
        gameState,
        player,
        gameState.time,
      );
    } else if (entity.type === 'human') {
      const human = entity as HumanEntity;
      const isPlayer = human.id === player?.id;
      const isPlayerChild = playerChildren.some((child) => child.id === human.id);
      const isPlayerHeir = human.id === playerHeir?.id;
      const isPlayerParent = player && (human.id === player.motherId || human.id === player.fatherId);
      const isPlayerPartner =
        player && (human.partnerIds?.includes(player.id) || player.partnerIds?.includes(human.id));
      const isPlayerAttackTarget = player?.attackTargetId === human.id;
      renderWithWrapping(
        ctx,
        worldWidth,
        worldHeight,
        renderCharacter,
        human,
        isPlayer,
        isPlayerParent,
        isPlayerChild,
        isPlayerPartner,
        isPlayerHeir,
        isPlayerAttackTarget,
        isDebugOn,
        gameState.time,
        gameState.debugCharacterId,
      );
    } else if (entity.type === 'humanCorpse') {
      renderWithWrapping(ctx, worldWidth, worldHeight, renderHumanCorpse, entity as HumanCorpseEntity);
    }
  });

  gameState.visualEffects.forEach((effect) => {
    renderWithWrapping(ctx, worldWidth, worldHeight, renderVisualEffect, effect, gameState.time);
  });

  // Render tutorial highlights if active
  if (gameState.tutorialState.isActive && gameState.tutorialState.highlightedEntityIds.size > 0) {
    for (const highlightedEntityId of gameState.tutorialState.highlightedEntityIds) {
      const highlightedEntity = gameState.entities.entities.get(highlightedEntityId);
      if (highlightedEntity) {
        renderWithWrapping(
          ctx,
          worldWidth,
          worldHeight,
          renderTutorialHighlight,
          highlightedEntity,
          UI_TUTORIAL_HIGHLIGHT_RADIUS,
          UI_TUTORIAL_HIGHLIGHT_COLOR,
          gameState.time,
        );
      }
    }
  }

  ctx.restore(); // Restore context to draw UI in fixed positions

  if (!isIntro) {
    // --- UI Rendering ---\
    // Define rects for potential highlighting
    let hungerBarRect: { x: number; y: number; width: number; height: number } | null = null;
    let foodBarRect: { x: number; y: number; width: number; height: number } | null = null;

    ctx.fillStyle = UI_TEXT_COLOR;
    ctx.font = `${UI_FONT_SIZE}px "Press Start 2P", Arial`;
    ctx.shadowColor = UI_TEXT_SHADOW_COLOR;
    ctx.shadowBlur = UI_TEXT_SHADOW_BLUR;

    // --- Top-Left UI ---\\\\\\\
    ctx.textAlign = 'left';
    let uiLineY = UI_PADDING + UI_FONT_SIZE;

    // Time Display
    const year = gameState.time / (HOURS_PER_GAME_DAY / GAME_DAY_IN_REAL_SECONDS) / HUMAN_YEAR_IN_REAL_SECONDS;
    const yearProgress = year % 1; // Fractional part for progress bar
    const timeEmoji = UI_STATUS_EMOJIS[UIStatusType.Time];
    const iconTextPadding = 25;
    const barX = UI_PADDING + iconTextPadding;

    ctx.fillText(timeEmoji, UI_PADDING, uiLineY + UI_BAR_HEIGHT / 2 + UI_FONT_SIZE / 3);
    drawProgressBar(
      ctx,
      barX,
      uiLineY,
      UI_BAR_WIDTH,
      UI_BAR_HEIGHT,
      yearProgress,
      UI_BAR_BACKGROUND_COLOR,
      UI_TIME_BAR_COLOR,
    );

    uiLineY += UI_BAR_HEIGHT + UI_BAR_PADDING;

    if (player) {
      // Age Bar
      const miniatureY = uiLineY + UI_MINIATURE_CHARACTER_SIZE / 2;
      const ageBarY = uiLineY + (UI_MINIATURE_CHARACTER_SIZE - UI_BAR_HEIGHT) / 2;
      const miniaturePadding = 5;

      // Draw child miniature
      renderMiniatureCharacter(
        ctx,
        { x: UI_PADDING * 2, y: miniatureY },
        UI_MINIATURE_CHARACTER_SIZE,
        5,
        player.gender,
        false,
        false,
        false,
      );

      const ageBarX = UI_PADDING + UI_MINIATURE_CHARACTER_SIZE + miniaturePadding;
      const ageBarWidth = UI_BAR_WIDTH + iconTextPadding - (UI_MINIATURE_CHARACTER_SIZE + miniaturePadding) * 2;

      drawProgressBar(
        ctx,
        ageBarX,
        ageBarY,
        ageBarWidth,
        UI_BAR_HEIGHT,
        Math.floor(player.age) / HUMAN_MAX_AGE_YEARS,
        UI_BAR_BACKGROUND_COLOR,
        UI_AGE_BAR_COLOR,
      );

      // Draw elder miniature
      renderMiniatureCharacter(
        ctx,
        { x: ageBarX + ageBarWidth + miniaturePadding + UI_MINIATURE_CHARACTER_SIZE / 2, y: miniatureY },
        UI_MINIATURE_CHARACTER_SIZE,
        HUMAN_MAX_AGE_YEARS,
        player.gender,
        false,
        false,
        false,
      );
      uiLineY += UI_BAR_HEIGHT + UI_BAR_PADDING * 2;

      // Family Bar
      const familyMembersToDisplay: {
        member: HumanEntity;
        isPlayer: boolean;
        isHeir: boolean;
        isPartner: boolean;
        isParent: boolean;
      }[] = [];
      const displayedIds = new Set<EntityId>();

      // 1. Add Player
      familyMembersToDisplay.push({ member: player, isPlayer: true, isHeir: false, isPartner: false, isParent: false });
      displayedIds.add(player.id);

      // 2. Add Heir
      if (playerHeir && !displayedIds.has(playerHeir.id)) {
        familyMembersToDisplay.push({
          member: playerHeir,
          isPlayer: false,
          isHeir: true,
          isPartner: false,
          isParent: false,
        });
        displayedIds.add(playerHeir.id);
      }

      // 3. Add Partners
      playerPartners.forEach((p) => {
        if (!displayedIds.has(p.id)) {
          familyMembersToDisplay.push({ member: p, isPlayer: false, isHeir: false, isPartner: true, isParent: false });
          displayedIds.add(p.id);
        }
      });

      // 4. Add other Children
      playerChildren.forEach((c) => {
        if (!displayedIds.has(c.id)) {
          familyMembersToDisplay.push({ member: c, isPlayer: false, isHeir: false, isPartner: false, isParent: false });
          displayedIds.add(c.id);
        }
      });

      // 5. Add parents
      if (player.motherId && !displayedIds.has(player.motherId)) {
        const mother = gameState.entities.entities.get(player.motherId) as HumanEntity | undefined;
        if (mother) {
          familyMembersToDisplay.push({
            member: mother,
            isPlayer: false,
            isHeir: false,
            isPartner: false,
            isParent: true,
          });
          displayedIds.add(mother.id);
        }
      }
      if (player.fatherId && !displayedIds.has(player.fatherId)) {
        const father = gameState.entities.entities.get(player.fatherId) as HumanEntity | undefined;
        if (father) {
          familyMembersToDisplay.push({
            member: father,
            isPlayer: false,
            isHeir: false,
            isPartner: false,
            isParent: true,
          });
          displayedIds.add(father.id);
        }
      }

      const familyEmoji = UI_STATUS_EMOJIS[UIStatusType.Family];
      const iconPadding = 10;
      const familyBarX = UI_PADDING + UI_FONT_SIZE + iconPadding;
      const familyBarMaxWidth = UI_BAR_WIDTH + iconTextPadding - (UI_FONT_SIZE + iconPadding);

      // Vertically center the large emoji with the row of miniatures
      const emojiY = uiLineY + UI_FAMILY_MEMBER_ICON_SIZE / 2;
      ctx.font = `${UI_FONT_SIZE}px "Press Start 2P", Arial`;
      ctx.textBaseline = 'middle';
      ctx.fillText(familyEmoji, UI_PADDING, emojiY);

      const familyBarY = uiLineY + UI_FAMILY_MEMBER_ICON_SIZE / 2; // Center the single row

      drawFamilyMemberBar(
        ctx,
        familyBarX,
        familyBarY,
        familyMembersToDisplay,
        UI_FAMILY_MEMBER_ICON_SIZE,
        familyBarMaxWidth,
      );

      uiLineY += UI_FAMILY_MEMBER_ICON_SIZE + UI_BAR_PADDING;
      ctx.textBaseline = 'alphabetic'; // Reset baseline

      // Hitpoints Bar
      const hpEmoji = UI_STATUS_EMOJIS[UIStatusType.Hitpoints];
      ctx.fillText(hpEmoji, UI_PADDING, uiLineY + UI_BAR_HEIGHT / 2 + UI_FONT_SIZE / 3);
      drawProgressBar(
        ctx,
        barX,
        uiLineY,
        UI_BAR_WIDTH,
        UI_BAR_HEIGHT,
        player.hitpoints / player.maxHitpoints,
        UI_BAR_BACKGROUND_COLOR,
        UI_HITPOINTS_BAR_COLOR,
      );
      uiLineY += UI_BAR_HEIGHT + UI_BAR_PADDING;

      // Hunger Bar
      const hungerEmoji = UI_STATUS_EMOJIS[UIStatusType.Hunger];
      ctx.fillText(hungerEmoji, UI_PADDING, uiLineY + UI_BAR_HEIGHT / 2 + UI_FONT_SIZE / 3);
      drawProgressBar(
        ctx,
        barX,
        uiLineY,
        UI_BAR_WIDTH,
        UI_BAR_HEIGHT,
        (HUMAN_HUNGER_DEATH - player.hunger) / HUMAN_HUNGER_DEATH,
        UI_BAR_BACKGROUND_COLOR,
        UI_HUNGER_BAR_COLOR,
      );
      hungerBarRect = {
        x: UI_PADDING,
        y: uiLineY - UI_BAR_PADDING / 2,
        width: UI_BAR_WIDTH + iconTextPadding,
        height: UI_BAR_HEIGHT + UI_BAR_PADDING,
      };
      uiLineY += UI_BAR_HEIGHT + UI_BAR_PADDING;

      // Food Bar
      ctx.textBaseline = 'middle';
      const foodEmoji = UI_STATUS_EMOJIS[UIStatusType.Food];
      ctx.fillText(foodEmoji, UI_PADDING, uiLineY + UI_BERRY_ICON_SIZE / 2);
      drawFoodBar(
        ctx,
        barX, // Use the same X as other bars for alignment
        uiLineY + UI_BERRY_ICON_SIZE / 2,
        player.food,
        UI_BERRY_ICON_SIZE,
        UI_BAR_WIDTH,
      );
      foodBarRect = {
        x: UI_PADDING,
        y: uiLineY - UI_BAR_PADDING / 5,
        width: UI_BAR_WIDTH + iconTextPadding,
        height: UI_BERRY_ICON_SIZE + UI_BAR_PADDING,
      };
      ctx.textBaseline = 'alphabetic';
      uiLineY += UI_BERRY_ICON_SIZE + UI_BAR_PADDING * 2; // Add extra padding
    }

    // --- Bottom-Left UI (Tribe List) ---\
    const tribesInfo = getTribesInfo(gameState, player?.leaderId);
    renderTribeList(ctx, tribesInfo, ctx.canvas.width, ctx.canvas.height);

    // --- Buttons & Tooltips ---\
    renderUIButtons(ctx, gameState, ctx.canvas.width);

    // Reset shadow for other UI elements if needed
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;

    if (player && playerActionHints.length > 0) {
      renderPlayerActionHints(ctx, playerActionHints, player, viewportCenter, ctx.canvas.width, ctx.canvas.height);
    }

    // --- UI Highlights ---\
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
