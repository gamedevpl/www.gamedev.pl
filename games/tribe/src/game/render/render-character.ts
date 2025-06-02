import { HumanEntity } from '../entities/characters/human/human-types';
import { HUMAN_HUNGER_THRESHOLD_SLOW } from '../world-consts';

const CHARACTER_RADIUS = 15;
const PLAYER_INDICATOR_RADIUS = 5;

/**
 * Renders a human character on the canvas
 * @param ctx Canvas rendering context
 * @param human The human entity to render
 */
export function renderCharacter(ctx: CanvasRenderingContext2D, human: HumanEntity): void {
  const { position, gender, isPlayer, hunger } = human;
  
  // Adjust character radius based on adult status
  const currentCharacterRadius = human.isAdult ? CHARACTER_RADIUS : CHARACTER_RADIUS * 0.6;

  // Draw the main character circle
  ctx.beginPath();
  ctx.arc(position.x, position.y, currentCharacterRadius, 0, Math.PI * 2);

  // Color based on gender
  if (gender === 'male') {
    ctx.fillStyle = '#3498db'; // Blue for male
  } else {
    ctx.fillStyle = '#e74c3c'; // Red for female
  }

  // If hunger is above threshold, make the color more transparent to indicate weakness
  if (hunger >= HUMAN_HUNGER_THRESHOLD_SLOW) {
    ctx.globalAlpha = 0.7;
  }

  ctx.fill();
  ctx.globalAlpha = 1.0; // Reset alpha
  
  // Draw pregnancy indicator for pregnant females
  if (gender === 'female' && human.isPregnant) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.beginPath();
    ctx.arc(position.x, position.y, currentCharacterRadius * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Draw outline
  ctx.strokeStyle = '#2c3e50';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Draw player indicator if this is the player character
  if (isPlayer) {
    ctx.beginPath();
    ctx.arc(position.x, position.y - currentCharacterRadius - 5, PLAYER_INDICATOR_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = '#f1c40f'; // Yellow indicator
    ctx.fill();
    ctx.strokeStyle = '#2c3e50';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Optional: Display hunger level for debugging
  ctx.fillStyle = 'white';
  ctx.font = '10px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(`H: ${Math.floor(hunger)}`, position.x, position.y + currentCharacterRadius + 15);
  ctx.fillText(`Age: ${human.age << 0}`, position.x, position.y + currentCharacterRadius + 30);
  ctx.fillText(`Berries: ${human.berries}/${human.maxBerries}`, position.x, position.y + currentCharacterRadius + 45);
  ctx.fillText(`Action: ${human.activeAction || 'idle'}`, position.x, position.y + currentCharacterRadius + 60);
  ctx.fillText(
    `State: ${human.stateMachine ? human.stateMachine[0] : 'unknown'}`,
    position.x,
    position.y + currentCharacterRadius + 75,
  );
}