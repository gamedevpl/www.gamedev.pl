import { GameWorldState } from '../../world-types';
import { HumanEntity } from '../../entities/characters/human/human-types';
import { ArmyControlObjective, ClickableUIButton, UIButtonActionType } from '../../ui/ui-types';
import { UI_BUTTON_TEXT_COLOR, UI_FONT_SIZE } from '../../ui/ui-consts.ts';
import {
  DEFAULT_ARMY_CONTROL_PROTECT_HOMELAND,
  DEFAULT_ARMY_CONTROL_EXPAND_BORDERS,
  DEFAULT_ARMY_CONTROL_INVADE_ENEMIES,
} from '../../entities/tribe/tribe-consts.ts';

const PANEL_WIDTH = 600;
const PANEL_PADDING = 30;
const ROW_HEIGHT = 60;
const BUTTON_SIZE = 30;

interface ArmyObjectiveConfig {
  key: ArmyControlObjective;
  emoji: string;
  name: string;
  description: string;
}

const ARMY_OBJECTIVES: ArmyObjectiveConfig[] = [
  {
    key: 'protectHomeland',
    emoji: '🛡️',
    name: 'Protect Homeland',
    description: 'Stay inside territory and protect from enemies',
  },
  {
    key: 'expandBorders',
    emoji: '🏰',
    name: 'Expand Borders',
    description: 'Expand territory by placing border posts (Coming Soon)',
  },
  {
    key: 'invadeEnemies',
    emoji: '⚔️',
    name: 'Invade Enemies',
    description: 'Attack enemies outside of our border',
  },
];

export function renderArmyControl(
  ctx: CanvasRenderingContext2D,
  gameState: GameWorldState,
  player: HumanEntity,
): ClickableUIButton[] {
  const buttons: ClickableUIButton[] = [];

  // Check that player is a leader with tribeControl
  if (!player.tribeControl || player.leaderId !== player.id) {
    return buttons;
  }

  const armyControl = player.tribeControl.armyControl ?? {
    protectHomeland: DEFAULT_ARMY_CONTROL_PROTECT_HOMELAND,
    expandBorders: DEFAULT_ARMY_CONTROL_EXPAND_BORDERS,
    invadeEnemies: DEFAULT_ARMY_CONTROL_INVADE_ENEMIES,
  };

  const { width, height } = ctx.canvas;
  const panelX = (width - PANEL_WIDTH) / 2;
  const panelHeight = 350;
  const panelY = (height - panelHeight) / 2;

  // Draw Panel Background
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
  ctx.beginPath();
  ctx.roundRect(panelX, panelY, PANEL_WIDTH, panelHeight, 10);
  ctx.fill();
  ctx.strokeStyle = '#444';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Title
  ctx.fillStyle = UI_BUTTON_TEXT_COLOR;
  ctx.font = `${UI_FONT_SIZE * 1.2}px "Press Start 2P", Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('Army Control', panelX + PANEL_WIDTH / 2, panelY + PANEL_PADDING);

  // Close Button
  const closeButtonSize = 30;
  const closeButtonX = panelX + PANEL_WIDTH - PANEL_PADDING - closeButtonSize;
  const closeButtonY = panelY + PANEL_PADDING;
  const isCloseHovered = gameState.hoveredButtonId === 'armyControl_close';

  ctx.fillStyle = isCloseHovered ? '#ff7777' : '#ff5555';
  ctx.fillRect(closeButtonX, closeButtonY, closeButtonSize, closeButtonSize);
  ctx.fillStyle = '#ffffff';
  ctx.font = '20px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('X', closeButtonX + closeButtonSize / 2, closeButtonY + closeButtonSize / 2);

  buttons.push({
    id: 'armyControl_close',
    action: UIButtonActionType.CloseArmyControl,
    rect: { x: closeButtonX, y: closeButtonY, width: closeButtonSize, height: closeButtonSize },
    text: 'X',
    currentWidth: closeButtonSize,
    backgroundColor: '#ff5555',
    textColor: '#ffffff',
  });

  // Calculate total weight for percentages
  let totalWeight = 0;
  ARMY_OBJECTIVES.forEach((obj) => {
    totalWeight += armyControl[obj.key] || 0;
  });

  // Render Objectives
  let currentY = panelY + PANEL_PADDING + 70;
  const leftColumnX = panelX + PANEL_PADDING;
  const rightColumnX = panelX + PANEL_WIDTH - PANEL_PADDING;

  ARMY_OBJECTIVES.forEach((objectiveData) => {
    const weight = armyControl[objectiveData.key] || 0;
    const percentage = totalWeight > 0 ? Math.round((weight / totalWeight) * 100) : 0;
    const isExpandBorders = objectiveData.key === 'expandBorders';

    // Objective Name & Emoji
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = `${UI_FONT_SIZE * 0.8}px "Press Start 2P", Arial`;
    ctx.fillStyle = isExpandBorders ? '#666' : UI_BUTTON_TEXT_COLOR;
    ctx.fillText(`${objectiveData.emoji} ${objectiveData.name}`, leftColumnX, currentY + ROW_HEIGHT / 2);

    // Controls Layout
    const minusX = panelX + 320;
    const iconsStartX = minusX + BUTTON_SIZE + 15;
    const iconsWidth = 120;
    const plusX = iconsStartX + iconsWidth + 15;

    // Minus Button
    const minusBtnId = `army_minus_${objectiveData.key}`;
    const isMinusHovered = gameState.hoveredButtonId === minusBtnId;
    const minusDisabled = weight <= 0 || isExpandBorders;
    const minusColor = minusDisabled ? '#555' : isMinusHovered ? '#dd6666' : '#cc4444';

    ctx.fillStyle = minusColor;
    ctx.fillRect(minusX, currentY + (ROW_HEIGHT - BUTTON_SIZE) / 2, BUTTON_SIZE, BUTTON_SIZE);
    ctx.fillStyle = minusDisabled ? '#888' : '#fff';
    ctx.textAlign = 'center';
    ctx.fillText('-', minusX + BUTTON_SIZE / 2, currentY + ROW_HEIGHT / 2 + 2);

    buttons.push({
      id: minusBtnId,
      action: UIButtonActionType.DecreaseArmyObjective,
      targetArmyObjective: objectiveData.key,
      rect: { x: minusX, y: currentY + (ROW_HEIGHT - BUTTON_SIZE) / 2, width: BUTTON_SIZE, height: BUTTON_SIZE },
      text: '-',
      currentWidth: BUTTON_SIZE,
      backgroundColor: minusColor,
      textColor: '#fff',
      isDisabled: minusDisabled,
    });

    // Visual Weight Bar
    ctx.textAlign = 'left';
    ctx.font = '16px Arial';
    ctx.fillStyle = isExpandBorders ? '#444' : '#4CAF50';

    const barWidth = iconsWidth - 10;
    const barHeight = 12;
    const barY = currentY + ROW_HEIGHT / 2 - barHeight / 2;

    // Background bar
    ctx.fillStyle = '#333';
    ctx.fillRect(iconsStartX, barY, barWidth, barHeight);

    // Filled bar based on weight (0-10 scale)
    const fillWidth = (weight / 10) * barWidth;
    ctx.fillStyle = isExpandBorders ? '#444' : '#4CAF50';
    ctx.fillRect(iconsStartX, barY, fillWidth, barHeight);

    // Plus Button
    const plusBtnId = `army_plus_${objectiveData.key}`;
    const isPlusHovered = gameState.hoveredButtonId === plusBtnId;
    const plusDisabled = weight >= 10 || isExpandBorders;
    const plusColor = plusDisabled ? '#555' : isPlusHovered ? '#66dd66' : '#44cc44';

    ctx.fillStyle = plusColor;
    ctx.fillRect(plusX, currentY + (ROW_HEIGHT - BUTTON_SIZE) / 2, BUTTON_SIZE, BUTTON_SIZE);
    ctx.fillStyle = plusDisabled ? '#888' : '#fff';
    ctx.textAlign = 'center';
    ctx.font = `${UI_FONT_SIZE * 0.8}px "Press Start 2P", Arial`;
    ctx.fillText('+', plusX + BUTTON_SIZE / 2, currentY + ROW_HEIGHT / 2 + 4);

    buttons.push({
      id: plusBtnId,
      action: UIButtonActionType.IncreaseArmyObjective,
      targetArmyObjective: objectiveData.key,
      rect: { x: plusX, y: currentY + (ROW_HEIGHT - BUTTON_SIZE) / 2, width: BUTTON_SIZE, height: BUTTON_SIZE },
      text: '+',
      currentWidth: BUTTON_SIZE,
      backgroundColor: plusColor,
      textColor: '#fff',
      isDisabled: plusDisabled,
    });

    // Percentage
    ctx.textAlign = 'right';
    ctx.font = `${UI_FONT_SIZE * 0.8}px "Press Start 2P", Arial`;
    ctx.fillStyle = isExpandBorders ? '#666' : UI_BUTTON_TEXT_COLOR;
    ctx.fillText(`${percentage}%`, rightColumnX, currentY + ROW_HEIGHT / 2);

    currentY += ROW_HEIGHT;
  });

  // Footer Info
  ctx.textAlign = 'center';
  ctx.fillStyle = '#aaa';
  ctx.font = `${UI_FONT_SIZE * 0.6}px "Press Start 2P", Arial`;
  ctx.fillText(`Adjust priorities for warrior objectives`, panelX + PANEL_WIDTH / 2, currentY + 10);
  ctx.fillText(`Higher values = higher priority`, panelX + PANEL_WIDTH / 2, currentY + 30);

  ctx.restore();

  return buttons;
}
