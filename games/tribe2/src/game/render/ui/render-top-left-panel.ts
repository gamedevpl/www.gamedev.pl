import { HumanEntity } from '../../entities/characters/human/human-types';
import { GAME_DAY_IN_REAL_SECONDS, HOURS_PER_GAME_DAY } from '../../game-consts.ts';
import { HUMAN_HUNGER_DEATH, HUMAN_MAX_AGE_YEARS, HUMAN_YEAR_IN_REAL_SECONDS } from '../../human-consts.ts';
import {
  UI_AGE_BAR_COLOR,
  UI_BAR_BACKGROUND_COLOR,
  UI_BAR_HEIGHT,
  UI_BAR_PADDING,
  UI_BAR_WIDTH,
  UI_BERRY_ICON_SIZE,
  UI_FAMILY_MEMBER_ICON_SIZE,
  UI_FONT_SIZE,
  UI_HITPOINTS_BAR_COLOR,
  UI_HUNGER_BAR_COLOR,
  UI_MINIATURE_CHARACTER_SIZE,
  UI_PADDING,
  UI_TIME_BAR_COLOR,
} from '../../ui/ui-consts.ts';
import { GameWorldState } from '../../world-types';
import { UIStatusType, UI_STATUS_EMOJIS } from '../../ui/ui-types';
import { drawFoodBar, drawProgressBar } from './render-bars';
import { drawFamilyMemberBar, renderMiniatureCharacter } from './render-characters-ui';
import { EntityId } from '../../entities/entities-types';
import { Rect2D } from '../../utils/math-types';

export function renderTopLeftPanel(
  ctx: CanvasRenderingContext2D,
  gameState: GameWorldState,
  player: HumanEntity,
  playerHeir: HumanEntity | undefined,
  playerPartners: HumanEntity[],
  playerChildren: HumanEntity[],
): { hungerBarRect: Rect2D | null; foodBarRect: Rect2D | null } {
  let hungerBarRect: Rect2D | null = null;
  let foodBarRect: Rect2D | null = null;

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
    const mother = gameState.entities.entities[player.motherId] as HumanEntity | undefined;
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
    const father = gameState.entities.entities[player.fatherId] as HumanEntity | undefined;
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

  return { hungerBarRect, foodBarRect };
}
