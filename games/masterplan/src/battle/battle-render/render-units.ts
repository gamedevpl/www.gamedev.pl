import { BattleState, Unit, UnitType, SideType } from '../battle-state/battle-state-types';
import { toIsometric, isPositionVisible, calculateRotation, drawRoundedRect } from './render-utils';

// Define unit dimensions
const UNIT_WIDTH = 32;
const UNIT_HEIGHT = 32;

// Define unit colors
const UNIT_COLORS: Record<UnitType, string> = {
  warrior: '#8B4513',
  archer: '#228B22',
  tank: '#4682B4',
  artillery: '#DAA520',
  cavalry: '#800080',
  commander: '#DC143C',
};

// Define side colors
const SIDE_COLORS: Record<SideType, string> = {
  red: '#FF0000',
  blue: '#0000FF',
};

// Animation frames for idle and movement
const ANIMATION_FRAMES = 4;
const ANIMATION_SPEED = 0.1;

export function renderUnits(ctx: CanvasRenderingContext2D, battleState: BattleState) {
  battleState.units.forEach((unit) => {
    if (isPositionVisible(unit.position, ctx.canvas)) {
      renderUnit(ctx, unit, battleState.time);
    }
  });
}

function renderUnit(ctx: CanvasRenderingContext2D, unit: Unit, time: number) {
  const { isoX, isoY } = toIsometric(unit.position.x, unit.position.y);

  ctx.save();
  ctx.translate(isoX, isoY);

  // Apply rotation
  const rotation = calculateRotation(unit);
  ctx.rotate(rotation);

  // Render shadow
  renderShadow(ctx);

  // Render unit body
  renderUnitBody(ctx, unit, time);

  // Render health bar
  renderHealthBar(ctx, unit);

  ctx.restore();
}

function renderShadow(ctx: CanvasRenderingContext2D) {
  ctx.beginPath();
  ctx.ellipse(0, UNIT_HEIGHT / 4, UNIT_WIDTH / 3, UNIT_HEIGHT / 6, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.fill();
}

function renderUnitBody(ctx: CanvasRenderingContext2D, unit: Unit, time: number) {
  const baseColor = UNIT_COLORS[unit.type];
  const sideColor = SIDE_COLORS[unit.side];

  // Determine animation frame
  const frame = Math.floor((time * ANIMATION_SPEED) % ANIMATION_FRAMES);
  const yOffset = Math.sin((frame * Math.PI) / 2) * 2; // Simple up and down animation

  // Main body
  ctx.beginPath();
  ctx.rect(-UNIT_WIDTH / 4, -UNIT_HEIGHT / 2 + yOffset, UNIT_WIDTH / 2, UNIT_HEIGHT / 2);
  ctx.fillStyle = baseColor;
  ctx.fill();
  ctx.strokeStyle = 'black';
  ctx.stroke();

  // Side indicator
  ctx.beginPath();
  ctx.rect(-UNIT_WIDTH / 4, -UNIT_HEIGHT / 2 + yOffset, UNIT_WIDTH / 8, UNIT_HEIGHT / 2);
  ctx.fillStyle = sideColor;
  ctx.fill();

  // Unit type-specific elements
  renderUnitTypeElements(ctx, unit.type, yOffset);
}

function renderUnitTypeElements(ctx: CanvasRenderingContext2D, unitType: UnitType, yOffset: number) {
  ctx.fillStyle = 'black';
  switch (unitType) {
    case 'warrior':
      // Sword
      ctx.fillRect(UNIT_WIDTH / 4, -UNIT_HEIGHT / 3 + yOffset, UNIT_WIDTH / 8, UNIT_HEIGHT / 2);
      break;
    case 'archer':
      // Bow
      ctx.beginPath();
      ctx.arc(UNIT_WIDTH / 4, yOffset, UNIT_WIDTH / 4, -Math.PI / 2, Math.PI / 2);
      ctx.stroke();
      break;
    case 'tank':
      // Shield
      ctx.fillRect(UNIT_WIDTH / 8, -UNIT_HEIGHT / 3 + yOffset, UNIT_WIDTH / 4, UNIT_HEIGHT / 2);
      break;
    case 'artillery':
      // Cannon
      ctx.fillRect(UNIT_WIDTH / 8, -UNIT_HEIGHT / 6 + yOffset, UNIT_WIDTH / 2, UNIT_HEIGHT / 4);
      break;
    case 'cavalry':
      // Horse head
      ctx.beginPath();
      ctx.moveTo(UNIT_WIDTH / 4, -UNIT_HEIGHT / 4 + yOffset);
      ctx.lineTo(UNIT_WIDTH / 2, -UNIT_HEIGHT / 8 + yOffset);
      ctx.lineTo(UNIT_WIDTH / 2, UNIT_HEIGHT / 8 + yOffset);
      ctx.closePath();
      ctx.fill();
      break;
    case 'commander':
      // Crown
      ctx.beginPath();
      ctx.moveTo(-UNIT_WIDTH / 4, -UNIT_HEIGHT / 2 + yOffset);
      ctx.lineTo(0, -UNIT_HEIGHT / 2 - UNIT_HEIGHT / 8 + yOffset);
      ctx.lineTo(UNIT_WIDTH / 4, -UNIT_HEIGHT / 2 + yOffset);
      ctx.fill();
      break;
  }
}

function renderHealthBar(ctx: CanvasRenderingContext2D, unit: Unit) {
  const healthBarWidth = UNIT_WIDTH;
  const healthBarHeight = 5;
  const healthPercentage = unit.health / 100;

  // Position the health bar above the unit
  const healthBarY = -UNIT_HEIGHT / 2 - 10;

  // Background
  drawRoundedRect(ctx, -healthBarWidth / 2, healthBarY, healthBarWidth, healthBarHeight, 2);
  ctx.fillStyle = 'rgba(255, 0, 0, 0.5)';
  ctx.fill();

  // Health fill
  drawRoundedRect(ctx, -healthBarWidth / 2, healthBarY, healthBarWidth * healthPercentage, healthBarHeight, 2);
  ctx.fillStyle = 'rgba(0, 255, 0, 0.7)';
  ctx.fill();

  // Border
  ctx.strokeStyle = 'black';
  ctx.stroke();
}
