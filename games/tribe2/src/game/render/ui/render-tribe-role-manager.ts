import { GameWorldState } from '../../world-types';
import { HumanEntity } from '../../entities/characters/human/human-types';
import { ClickableUIButton, UIButtonActionType } from '../../ui/ui-types';
import { TribeRole } from '../../entities/tribe/tribe-types';
import { UI_BUTTON_TEXT_COLOR, UI_FONT_SIZE } from '../../ui/ui-consts.ts';
import { findTribeMembers } from '../../utils/family-tribe-utils';

const PANEL_WIDTH = 600;
const PANEL_PADDING = 30;
const ROW_HEIGHT = 60;
const BUTTON_SIZE = 30;
const MINI_HUMAN_ICON = '👤';

export function renderTribeRoleManager(
  ctx: CanvasRenderingContext2D,
  gameState: GameWorldState,
  player: HumanEntity,
): ClickableUIButton[] {
  const buttons: ClickableUIButton[] = [];

  if (!player.tribeControl || !player.leaderId) {
    return buttons;
  }

  const { width, height } = ctx.canvas;
  const panelX = (width - PANEL_WIDTH) / 2;
  const panelHeight = 450;
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
  ctx.fillText('Tribe Roles', panelX + PANEL_WIDTH / 2, panelY + PANEL_PADDING);

  // Close Button
  const closeButtonSize = 30;
  const closeButtonX = panelX + PANEL_WIDTH - PANEL_PADDING - closeButtonSize;
  const closeButtonY = panelY + PANEL_PADDING;
  const isCloseHovered = gameState.hoveredButtonId === 'roleManager_close';

  ctx.fillStyle = isCloseHovered ? '#ff7777' : '#ff5555';
  ctx.fillRect(closeButtonX, closeButtonY, closeButtonSize, closeButtonSize);
  ctx.fillStyle = '#ffffff';
  ctx.font = '20px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('X', closeButtonX + closeButtonSize / 2, closeButtonY + closeButtonSize / 2);

  buttons.push({
    id: 'roleManager_close',
    action: UIButtonActionType.CloseRoleManager,
    rect: { x: closeButtonX, y: closeButtonY, width: closeButtonSize, height: closeButtonSize },
    text: 'X',
    currentWidth: closeButtonSize,
    backgroundColor: '#ff5555',
    textColor: '#ffffff',
  });

  // Get tribe members and count roles
  const tribeMembers = findTribeMembers(player.leaderId, gameState);
  const adultMembers = tribeMembers.filter((m) => m.isAdult);

  const roleCounts: Record<TribeRole, number> = {
    [TribeRole.Leader]: 0,
    [TribeRole.Gatherer]: 0,
    [TribeRole.Hunter]: 0,
    [TribeRole.Mover]: 0,
    [TribeRole.Warrior]: 0,
  };

  adultMembers.forEach((member) => {
    if (member.tribeRole) {
      roleCounts[member.tribeRole]++;
    }
  });

  // Calculate total weight for percentages
  const weights = player.tribeControl.roleWeights;
  const rolesToDisplay = [
    { role: TribeRole.Gatherer, emoji: '🧺', name: 'Gatherer' },
    { role: TribeRole.Hunter, emoji: '🏹', name: 'Hunter' },
    { role: TribeRole.Mover, emoji: '📦', name: 'Mover' },
    { role: TribeRole.Warrior, emoji: '⚔️', name: 'Warrior' },
  ];

  let totalWeight = 0;
  rolesToDisplay.forEach((r) => {
    totalWeight += weights[r.role] || 0;
  });

  // Render Roles
  let currentY = panelY + PANEL_PADDING + 70;
  const leftColumnX = panelX + PANEL_PADDING;
  const rightColumnX = panelX + PANEL_WIDTH - PANEL_PADDING;

  rolesToDisplay.forEach((roleData) => {
    const weight = weights[roleData.role] || 0;
    const percentage = totalWeight > 0 ? Math.round((weight / totalWeight) * 100) : 0;
    const currentCount = roleCounts[roleData.role] || 0;

    // Role Name & Emoji
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = `${UI_FONT_SIZE * 0.8}px "Press Start 2P", Arial`;
    ctx.fillStyle = UI_BUTTON_TEXT_COLOR;
    ctx.fillText(`${roleData.emoji} ${currentCount} ${roleData.name}`, leftColumnX, currentY + ROW_HEIGHT / 2);

    // Controls Layout
    const minusX = panelX + 220;
    const iconsStartX = minusX + BUTTON_SIZE + 15;
    const iconsWidth = 200; // Space for icons
    const plusX = iconsStartX + iconsWidth + 15;

    // Minus Button
    const minusBtnId = `role_minus_${roleData.role}`;
    const isMinusHovered = gameState.hoveredButtonId === minusBtnId;
    const minusDisabled = weight <= 0;
    const minusColor = minusDisabled ? '#555' : isMinusHovered ? '#dd6666' : '#cc4444';

    ctx.fillStyle = minusColor;
    ctx.fillRect(minusX, currentY + (ROW_HEIGHT - BUTTON_SIZE) / 2, BUTTON_SIZE, BUTTON_SIZE);
    ctx.fillStyle = minusDisabled ? '#888' : '#fff';
    ctx.textAlign = 'center';
    ctx.fillText('-', minusX + BUTTON_SIZE / 2, currentY + ROW_HEIGHT / 2 + 2);

    buttons.push({
      id: minusBtnId,
      action: UIButtonActionType.DecreaseRoleWeight,
      targetRole: roleData.role,
      rect: { x: minusX, y: currentY + (ROW_HEIGHT - BUTTON_SIZE) / 2, width: BUTTON_SIZE, height: BUTTON_SIZE },
      text: '-',
      currentWidth: BUTTON_SIZE,
      backgroundColor: minusColor,
      textColor: '#fff',
      isDisabled: minusDisabled,
    });

    // Visual Weight Icons
    ctx.textAlign = 'left';
    ctx.font = '16px Arial';
    ctx.fillStyle = '#fff';
    let iconX = iconsStartX;
    for (let i = 0; i < weight; i++) {
      ctx.fillText(MINI_HUMAN_ICON, iconX, currentY + ROW_HEIGHT / 2 + 2);
      iconX += 18;
    }

    // Plus Button
    const plusBtnId = `role_plus_${roleData.role}`;
    const isPlusHovered = gameState.hoveredButtonId === plusBtnId;
    const plusDisabled = weight >= 10;
    const plusColor = plusDisabled ? '#555' : isPlusHovered ? '#66dd66' : '#44cc44';

    ctx.fillStyle = plusColor;
    ctx.fillRect(plusX, currentY + (ROW_HEIGHT - BUTTON_SIZE) / 2, BUTTON_SIZE, BUTTON_SIZE);
    ctx.fillStyle = plusDisabled ? '#888' : '#fff';
    ctx.textAlign = 'center';
    ctx.font = `${UI_FONT_SIZE * 0.8}px "Press Start 2P", Arial`;
    ctx.fillText('+', plusX + BUTTON_SIZE / 2, currentY + ROW_HEIGHT / 2 + 4);

    buttons.push({
      id: plusBtnId,
      action: UIButtonActionType.IncreaseRoleWeight,
      targetRole: roleData.role,
      rect: { x: plusX, y: currentY + (ROW_HEIGHT - BUTTON_SIZE) / 2, width: BUTTON_SIZE, height: BUTTON_SIZE },
      text: '+',
      currentWidth: BUTTON_SIZE,
      backgroundColor: plusColor,
      textColor: '#fff',
      isDisabled: plusDisabled,
    });

    // Current Count and Percentage
    ctx.textAlign = 'right';
    ctx.font = `${UI_FONT_SIZE * 0.8}px "Press Start 2P", Arial`;
    ctx.fillStyle = UI_BUTTON_TEXT_COLOR;
    ctx.fillText(`${percentage}%`, rightColumnX, currentY + ROW_HEIGHT / 2);

    currentY += ROW_HEIGHT;
  });

  // Footer Info
  const leaderCount = roleCounts[TribeRole.Leader];
  const assignedCount = Object.values(roleCounts).reduce((sum, count) => sum + count, 0);
  const unassignedCount = adultMembers.length - assignedCount;

  ctx.textAlign = 'center';
  ctx.fillStyle = '#aaa';
  ctx.font = `${UI_FONT_SIZE * 0.6}px "Press Start 2P", Arial`;
  ctx.fillText(
    `Adults: ${adultMembers.length} | Leader: ${leaderCount} | Assigned: ${assignedCount} | Unassigned: ${unassignedCount}`,
    panelX + PANEL_WIDTH / 2,
    currentY + 10,
  );
  ctx.fillText(`(Adjust weights to control role distribution)`, panelX + PANEL_WIDTH / 2, currentY + 30);

  ctx.restore();

  return buttons;
}
