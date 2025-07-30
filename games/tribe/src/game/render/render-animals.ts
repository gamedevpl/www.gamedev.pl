import { PreyEntity } from '../entities/characters/prey/prey-types';
import { PredatorEntity } from '../entities/characters/predator/predator-types';

/**
 * Renders a prey entity as a simple brown/tan circle with basic status indicators.
 */
export function renderPrey(ctx: CanvasRenderingContext2D, prey: PreyEntity): void {
  const { x, y } = prey.position;
  const radius = prey.radius;

  // Main body - brown/tan color
  ctx.fillStyle = prey.isAdult ? '#8B4513' : '#D2B48C'; // Brown for adults, lighter for young
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, 2 * Math.PI);
  ctx.fill();

  // Border
  ctx.strokeStyle = '#654321';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Gender indicator (small circle)
  const genderColor = prey.gender === 'male' ? '#4169E1' : '#FF69B4'; // Blue for male, pink for female
  ctx.fillStyle = genderColor;
  ctx.beginPath();
  ctx.arc(x + radius * 0.6, y - radius * 0.6, radius * 0.2, 0, 2 * Math.PI);
  ctx.fill();

  // Health bar if injured
  if (prey.hitpoints < prey.maxHitpoints) {
    const barWidth = radius * 1.5;
    const barHeight = 3;
    const barX = x - barWidth / 2;
    const barY = y - radius - 8;

    // Background
    ctx.fillStyle = '#555';
    ctx.fillRect(barX, barY, barWidth, barHeight);

    // Health
    const healthRatio = prey.hitpoints / prey.maxHitpoints;
    ctx.fillStyle = healthRatio > 0.5 ? '#4CAF50' : healthRatio > 0.25 ? '#FFC107' : '#F44336';
    ctx.fillRect(barX, barY, barWidth * healthRatio, barHeight);
  }

  // Pregnancy indicator for females
  if (prey.isPregnant) {
    ctx.fillStyle = '#FFB6C1'; // Light pink
    ctx.beginPath();
    ctx.arc(x, y + radius * 0.3, radius * 0.3, 0, 2 * Math.PI);
    ctx.fill();
  }

  // Fleeing indicator (red outline when fleeing)
  if (prey.fleeCooldown && prey.fleeCooldown > 0) {
    ctx.strokeStyle = '#FF0000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, radius + 2, 0, 2 * Math.PI);
    ctx.stroke();
  }
}

/**
 * Renders a predator entity as a darker circle with fangs and status indicators.
 */
export function renderPredator(ctx: CanvasRenderingContext2D, predator: PredatorEntity): void {
  const { x, y } = predator.position;
  const radius = predator.radius;

  // Main body - dark gray/black color
  ctx.fillStyle = predator.isAdult ? '#2F2F2F' : '#696969'; // Dark for adults, lighter for young
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, 2 * Math.PI);
  ctx.fill();

  // Border
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Eyes (red dots)
  ctx.fillStyle = '#FF0000';
  ctx.beginPath();
  ctx.arc(x - radius * 0.3, y - radius * 0.3, radius * 0.15, 0, 2 * Math.PI);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + radius * 0.3, y - radius * 0.3, radius * 0.15, 0, 2 * Math.PI);
  ctx.fill();

  // Fangs (white triangles)
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.moveTo(x - radius * 0.2, y + radius * 0.2);
  ctx.lineTo(x - radius * 0.1, y + radius * 0.5);
  ctx.lineTo(x - radius * 0.3, y + radius * 0.5);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x + radius * 0.2, y + radius * 0.2);
  ctx.lineTo(x + radius * 0.1, y + radius * 0.5);
  ctx.lineTo(x + radius * 0.3, y + radius * 0.5);
  ctx.fill();

  // Gender indicator (small circle)
  const genderColor = predator.gender === 'male' ? '#4169E1' : '#FF69B4'; // Blue for male, pink for female
  ctx.fillStyle = genderColor;
  ctx.beginPath();
  ctx.arc(x + radius * 0.6, y - radius * 0.6, radius * 0.2, 0, 2 * Math.PI);
  ctx.fill();

  // Health bar if injured
  if (predator.hitpoints < predator.maxHitpoints) {
    const barWidth = radius * 1.5;
    const barHeight = 3;
    const barX = x - barWidth / 2;
    const barY = y - radius - 8;

    // Background
    ctx.fillStyle = '#555';
    ctx.fillRect(barX, barY, barWidth, barHeight);

    // Health
    const healthRatio = predator.hitpoints / predator.maxHitpoints;
    ctx.fillStyle = healthRatio > 0.5 ? '#4CAF50' : healthRatio > 0.25 ? '#FFC107' : '#F44336';
    ctx.fillRect(barX, barY, barWidth * healthRatio, barHeight);
  }

  // Pregnancy indicator for females
  if (predator.isPregnant) {
    ctx.fillStyle = '#FFB6C1'; // Light pink
    ctx.beginPath();
    ctx.arc(x, y + radius * 0.3, radius * 0.3, 0, 2 * Math.PI);
    ctx.fill();
  }

  // Hunting/attacking indicator (orange outline when in combat)
  if ((predator.attackCooldown && predator.attackCooldown > 0) || (predator.huntCooldown && predator.huntCooldown > 0)) {
    ctx.strokeStyle = '#FF8C00'; // Dark orange
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, radius + 3, 0, 2 * Math.PI);
    ctx.stroke();
  }
}