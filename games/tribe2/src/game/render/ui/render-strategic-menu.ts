import { GameWorldState } from '../../world-types';
import { StrategicObjective } from '../../entities/tribe/tribe-types';
import { UIButtonActionType } from '../../ui/ui-types';
import { findPlayerEntity, findTribeMembers } from '../../utils/world-utils';
import { HumanEntity } from '../../entities/characters/human/human-types';
import {
  UI_AUTOPILOT_BUTTON_SIZE,
  UI_AUTOPILOT_BUTTON_SPACING,
  UI_BUTTON_ACTIVE_BACKGROUND_COLOR,
  UI_BUTTON_ACTIVATED_BORDER_COLOR,
  UI_BUTTON_BACKGROUND_COLOR,
  UI_BUTTON_DISABLED_TEXT_COLOR,
  UI_BUTTON_TEXT_COLOR,
  UI_BUTTON_HEIGHT,
  UI_FONT_SIZE,
  UI_PADDING,
} from '../../ui/ui-consts.ts';

export interface ObjectiveDefinition {
  objective: StrategicObjective;
  icon: string;
  name: string;
}

export interface CategoryDefinition {
  name: string;
  icon: string;
  objectives: ObjectiveDefinition[];
}

export const OBJECTIVE_CATEGORIES: CategoryDefinition[] = [
  {
    name: 'ECONOMIC',
    icon: '🌾',
    objectives: [
      { objective: StrategicObjective.GreatHarvest, icon: '🌾', name: 'GREAT HARVEST' },
      { objective: StrategicObjective.GreenThumb, icon: '🌱', name: 'GREEN THUMB' },
      { objective: StrategicObjective.LumberjackFever, icon: '🪓', name: 'LUMBERJACK' },
      { objective: StrategicObjective.WinterPrep, icon: '🔥', name: 'WINTER PREP' },
    ],
  },
  {
    name: 'GROWTH',
    icon: '🏗️',
    objectives: [
      { objective: StrategicObjective.BabyBoom, icon: '👶', name: 'BABY BOOM' },
      { objective: StrategicObjective.ManifestDestiny, icon: '🗺️', name: 'MANIFEST' },
      { objective: StrategicObjective.IronCurtain, icon: '🧱', name: 'IRON CURTAIN' },
    ],
  },
  {
    name: 'MILITARY',
    icon: '⚔️',
    objectives: [
      { objective: StrategicObjective.Warpath, icon: '⚔️', name: 'WARPATH' },
      { objective: StrategicObjective.ActiveDefense, icon: '🛡️', name: 'DEFENSE' },
      { objective: StrategicObjective.RaidingParty, icon: '🗡️', name: 'RAIDING' },
    ],
  },
];

export function getObjectiveName(objective: StrategicObjective): string {
  if (objective === StrategicObjective.None) {
    return 'NONE';
  }
  for (const category of OBJECTIVE_CATEGORIES) {
    const found = category.objectives.find((o) => o.objective === objective);
    if (found) return found.name;
  }
  return 'STRATEGY';
}

export function getObjectiveIcon(objective: StrategicObjective): string {
  if (objective === StrategicObjective.None) {
    return '⭕';
  }
  for (const category of OBJECTIVE_CATEGORIES) {
    const found = category.objectives.find((o) => o.objective === objective);
    if (found) return found.icon;
  }
  return '🎖️';
}

export function renderStrategicMenu(
  ctx: CanvasRenderingContext2D,
  gameState: GameWorldState,
  canvasWidth: number,
  canvasHeight: number,
): void {
  const player = findPlayerEntity(gameState);
  if (!player || player.leaderId !== player.id) {
    return; // Only tribe leaders can see this menu
  }

  const leader = gameState.entities.entities[player.leaderId] as HumanEntity | undefined;
  if (!leader) return;

  const currentObjective = leader.tribeControl?.strategicObjective || StrategicObjective.None;
  const tribeMembers = findTribeMembers(player.leaderId, gameState);
  const population = tribeMembers.length;

  const gridCols = 3;
  const gridCellSize = Math.round(UI_AUTOPILOT_BUTTON_SIZE * 0.85);
  const gridSpacing = UI_AUTOPILOT_BUTTON_SPACING;
  const headerHeight = Math.round(UI_FONT_SIZE * 1.2);
  const currentRowHeight = UI_BUTTON_HEIGHT;
  const categoryHeaderHeight = Math.round(UI_FONT_SIZE * 0.7);
  const footerHeight = UI_BUTTON_HEIGHT + UI_PADDING;
  const sectionSpacing = UI_PADDING * 0.6;

  let contentHeight = headerHeight + currentRowHeight + gridSpacing;
  contentHeight += currentRowHeight + sectionSpacing;

  for (const category of OBJECTIVE_CATEGORIES) {
    const rows = Math.ceil(category.objectives.length / gridCols);
    const gridHeight = rows * gridCellSize + (rows - 1) * gridSpacing;
    contentHeight += categoryHeaderHeight + gridHeight + sectionSpacing;
  }

  const panelWidth =
    gridCols * gridCellSize + (gridCols - 1) * gridSpacing + UI_PADDING * 2;
  const panelHeight = contentHeight + footerHeight + UI_PADDING * 2;

  const buttonBarY = canvasHeight - UI_AUTOPILOT_BUTTON_SIZE - 20;
  const panelBottom = buttonBarY - gridSpacing;
  const panelX = Math.max(UI_PADDING, Math.floor((canvasWidth - panelWidth) / 2));
  const panelY = Math.max(UI_PADDING, Math.floor(panelBottom - panelHeight));

  ctx.save();

  // Panel background
  ctx.fillStyle = UI_BUTTON_BACKGROUND_COLOR;
  ctx.globalAlpha = 0.95;
  ctx.fillRect(panelX, panelY, panelWidth, panelHeight);
  ctx.globalAlpha = 1;

  // Panel border
  ctx.strokeStyle = UI_BUTTON_ACTIVE_BACKGROUND_COLOR;
  ctx.lineWidth = 2;
  ctx.strokeRect(panelX, panelY, panelWidth, panelHeight);

  let cursorY = panelY + UI_PADDING;

  // Header
  ctx.fillStyle = UI_BUTTON_TEXT_COLOR;
  ctx.font = `${Math.round(UI_FONT_SIZE * 0.7)}px "Press Start 2P", Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('STRATEGIC COMMAND', panelX + panelWidth / 2, cursorY + headerHeight / 2);
  cursorY += headerHeight;

  // Current strategy row
  const currentLabel = `${getObjectiveIcon(currentObjective)} ${getObjectiveName(currentObjective)}`;
  ctx.fillStyle = UI_BUTTON_ACTIVE_BACKGROUND_COLOR;
  ctx.fillRect(panelX + UI_PADDING, cursorY, panelWidth - UI_PADDING * 2, currentRowHeight);
  ctx.strokeStyle = UI_BUTTON_ACTIVATED_BORDER_COLOR;
  ctx.lineWidth = 1;
  ctx.strokeRect(panelX + UI_PADDING, cursorY, panelWidth - UI_PADDING * 2, currentRowHeight);
  ctx.fillStyle = UI_BUTTON_TEXT_COLOR;
  ctx.font = `${Math.round(UI_FONT_SIZE * 0.6)}px "Press Start 2P", Arial`;
  ctx.textAlign = 'center';
  ctx.fillText(currentLabel, panelX + panelWidth / 2, cursorY + currentRowHeight / 2);
  cursorY += currentRowHeight + gridSpacing;

  // None option row
  const noneSelected = currentObjective === StrategicObjective.None;
  ctx.fillStyle = noneSelected ? UI_BUTTON_ACTIVE_BACKGROUND_COLOR : UI_BUTTON_BACKGROUND_COLOR;
  ctx.fillRect(panelX + UI_PADDING, cursorY, panelWidth - UI_PADDING * 2, currentRowHeight);
  ctx.strokeStyle = UI_BUTTON_ACTIVE_BACKGROUND_COLOR;
  ctx.lineWidth = 1;
  ctx.strokeRect(panelX + UI_PADDING, cursorY, panelWidth - UI_PADDING * 2, currentRowHeight);
  ctx.fillStyle = UI_BUTTON_TEXT_COLOR;
  ctx.font = `${Math.round(UI_FONT_SIZE * 0.6)}px "Press Start 2P", Arial`;
  ctx.textAlign = 'center';
  ctx.fillText('⭕ NONE', panelX + panelWidth / 2, cursorY + currentRowHeight / 2);

  gameState.uiButtons.push({
    id: 'strategic_objective_none',
    action: UIButtonActionType.SelectStrategicObjective,
    rect: {
      x: panelX + UI_PADDING,
      y: cursorY,
      width: panelWidth - UI_PADDING * 2,
      height: currentRowHeight,
    },
    text: '',
    backgroundColor: 'transparent',
    textColor: UI_BUTTON_TEXT_COLOR,
    currentWidth: panelWidth - UI_PADDING * 2,
    objective: StrategicObjective.None,
  });

  cursorY += currentRowHeight + sectionSpacing;

  // Categories and objectives grid
  for (const category of OBJECTIVE_CATEGORIES) {
    ctx.fillStyle = UI_BUTTON_DISABLED_TEXT_COLOR;
    ctx.font = `${Math.round(UI_FONT_SIZE * 0.55)}px "Press Start 2P", Arial`;
    ctx.textAlign = 'left';
    ctx.fillText(`${category.icon} ${category.name}`, panelX + UI_PADDING, cursorY + categoryHeaderHeight / 2);
    cursorY += categoryHeaderHeight;

    category.objectives.forEach((objDef, index) => {
      const row = Math.floor(index / gridCols);
      const col = index % gridCols;
      const cellX = panelX + UI_PADDING + col * (gridCellSize + gridSpacing);
      const cellY = cursorY + row * (gridCellSize + gridSpacing);
      const isSelected = currentObjective === objDef.objective;

      ctx.fillStyle = isSelected ? UI_BUTTON_ACTIVE_BACKGROUND_COLOR : UI_BUTTON_BACKGROUND_COLOR;
      ctx.fillRect(cellX, cellY, gridCellSize, gridCellSize);
      ctx.strokeStyle = isSelected ? UI_BUTTON_ACTIVATED_BORDER_COLOR : UI_BUTTON_ACTIVE_BACKGROUND_COLOR;
      ctx.lineWidth = 1;
      ctx.strokeRect(cellX, cellY, gridCellSize, gridCellSize);

      ctx.fillStyle = UI_BUTTON_TEXT_COLOR;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `${Math.round(gridCellSize * 0.35)}px "Press Start 2P", Arial`;
      ctx.fillText(objDef.icon, cellX + gridCellSize / 2, cellY + gridCellSize * 0.35);
      ctx.font = `${Math.round(UI_FONT_SIZE * 0.45)}px "Press Start 2P", Arial`;
      ctx.fillText(objDef.name, cellX + gridCellSize / 2, cellY + gridCellSize * 0.72);

      gameState.uiButtons.push({
        id: `strategic_objective_${objDef.objective}`,
        action: UIButtonActionType.SelectStrategicObjective,
        rect: { x: cellX, y: cellY, width: gridCellSize, height: gridCellSize },
        text: '',
        backgroundColor: 'transparent',
        textColor: UI_BUTTON_TEXT_COLOR,
        currentWidth: gridCellSize,
        objective: objDef.objective,
      });
    });

    const rows = Math.ceil(category.objectives.length / gridCols);
    cursorY += rows * gridCellSize + (rows - 1) * gridSpacing + sectionSpacing;
  }

  // Footer
  const footerY = panelY + panelHeight - footerHeight;
  ctx.fillStyle = UI_BUTTON_ACTIVE_BACKGROUND_COLOR;
  ctx.fillRect(panelX + UI_PADDING, footerY, panelWidth - UI_PADDING * 2, footerHeight - UI_PADDING / 2);
  ctx.strokeStyle = UI_BUTTON_ACTIVE_BACKGROUND_COLOR;
  ctx.strokeRect(panelX + UI_PADDING, footerY, panelWidth - UI_PADDING * 2, footerHeight - UI_PADDING / 2);

  ctx.fillStyle = UI_BUTTON_TEXT_COLOR;
  ctx.font = `${Math.round(UI_FONT_SIZE * 0.5)}px "Press Start 2P", Arial`;
  ctx.textAlign = 'left';
  ctx.fillText(`POP: ${population}`, panelX + UI_PADDING + 8, footerY + footerHeight / 2 - 6);
  ctx.fillText('MORALE: 80%', panelX + UI_PADDING + 8, footerY + footerHeight / 2 + 8);

  ctx.restore();
}
