import { HunterEntity } from '../../game-world/entities/entities-types';
import { vectorLength } from '../../game-world/utils/math-utils';

// Constants for hunter rendering
const HUNTER_WIDTH = 40;
const HUNTER_HEIGHT = 40;
const HUNTER_COLOR = '#8B4513'; // Brown color for hunter
const GUN_COLOR = '#333333'; // Dark gray for gun
const LOW_HEALTH_COLOR = '#FF0000'; // Red for low health
const FULL_HEALTH_COLOR = '#00FF00'; // Green for full health

/**
 * Get the hunter's stance based on state and movement
 */
function getHunterStance(stateType: string, isMoving: boolean): string {
  switch (stateType) {
    case 'HUNTER_PATROLLING':
      return isMoving ? 'walking' : 'standing';
    case 'HUNTER_WAITING':
      return 'standing';
    case 'HUNTER_CHASING':
      return 'running';
    case 'HUNTER_SHOOTING':
      return 'shooting';
    case 'HUNTER_RELOADING':
      return 'reloading';
    default:
      return 'standing';
  }
}

/**
 * Determine the facing direction of the hunter
 */
function getHunterFacingDirection(hunter: HunterEntity): 'left' | 'right' {
  return hunter.targetDirection > -Math.PI / 2 && hunter.targetDirection < Math.PI / 2 ? 'right' : 'left';
}

/**
 * Draws the hunter entity on the canvas
 */
export function drawHunter(ctx: CanvasRenderingContext2D, hunter: HunterEntity) {
  const width = HUNTER_WIDTH;
  const height = HUNTER_HEIGHT;
  const position = hunter.position;
  const isMoving = vectorLength(hunter.velocity) > 0.1;
  
  // Get current state and stance
  const currentStateType = hunter.stateMachine?.[0] || 'HUNTER_PATROLLING';
  const stance = getHunterStance(currentStateType, isMoving);
  const facingDirection = getHunterFacingDirection(hunter);
  
  // Save the current context state
  ctx.save();
  
  // Translate to hunter position
  ctx.translate(position.x, position.y);
  
  // Draw health indicator
  const healthPercentage = hunter.health / 100;
  const healthColor = interpolateColor(LOW_HEALTH_COLOR, FULL_HEALTH_COLOR, healthPercentage);
  ctx.fillStyle = healthColor;
  ctx.fillRect(-width / 2, -height / 2 - 10, width * healthPercentage, 5);
  
  // Draw hunter body
  ctx.fillStyle = HUNTER_COLOR;
  
  // If reloading, show animation
  if (stance === 'reloading') {
    // Draw hunter with arms moving (simple animation)
    const animationTime = (Date.now() % 1000) / 1000;
    const armOffset = Math.sin(animationTime * Math.PI * 2) * 5;
    
    // Body
    ctx.fillRect(-width / 4, -height / 4, width / 2, height / 2);
    
    // Arms (animated for reloading)
    ctx.fillRect(
      facingDirection === 'right' ? width / 4 : -width / 4 - width / 8,
      -height / 4 + armOffset,
      width / 8,
      height / 3
    );
    
    // Legs
    ctx.fillRect(-width / 4, height / 4, width / 8, height / 4);
    ctx.fillRect(width / 8, height / 4, width / 8, height / 4);
  } 
  else if (stance === 'shooting') {
    // Draw hunter in shooting stance
    
    // Body
    ctx.fillRect(-width / 4, -height / 4, width / 2, height / 2);
    
    // Arms extended for shooting
    ctx.fillRect(
      facingDirection === 'right' ? width / 4 : -width / 4 - width / 3,
      -height / 8,
      width / 3,
      height / 8
    );
    
    // Gun
    ctx.fillStyle = GUN_COLOR;
    ctx.fillRect(
      facingDirection === 'right' ? width / 4 + width / 3 : -width / 4 - width / 3 - width / 6,
      -height / 8,
      width / 6,
      height / 12
    );
    
    // Muzzle flash if recently shot
    if (hunter.lastShotTime && Date.now() - hunter.lastShotTime < 200) {
      ctx.fillStyle = '#FFFF00';
      ctx.beginPath();
      ctx.arc(
        facingDirection === 'right' ? width / 4 + width / 3 + width / 6 : -width / 4 - width / 3 - width / 6 - width / 12,
        -height / 8 + height / 24,
        width / 12,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
    
    // Legs
    ctx.fillStyle = HUNTER_COLOR;
    ctx.fillRect(-width / 4, height / 4, width / 8, height / 4);
    ctx.fillRect(width / 8, height / 4, width / 8, height / 4);
  } 
  else {
    // Standard hunter drawing (standing, walking, running)
    
    // Body
    ctx.fillRect(-width / 4, -height / 4, width / 2, height / 2);
    
    // Arms
    ctx.fillRect(
      facingDirection === 'right' ? width / 4 : -width / 4 - width / 8,
      -height / 8,
      width / 8,
      height / 4
    );
    
    // Gun (always visible)
    ctx.fillStyle = GUN_COLOR;
    ctx.fillRect(
      facingDirection === 'right' ? width / 4 + width / 8 : -width / 4 - width / 8 - width / 6,
      -height / 8,
      width / 6,
      height / 12
    );
    
    // Legs with walking/running animation
    ctx.fillStyle = HUNTER_COLOR;
    if (stance === 'walking' || stance === 'running') {
      const animationTime = (Date.now() % 500) / 500;
      const legOffset = Math.sin(animationTime * Math.PI * 2) * (stance === 'running' ? 5 : 3);
      
      ctx.fillRect(-width / 4, height / 4 - legOffset, width / 8, height / 4);
      ctx.fillRect(width / 8, height / 4 + legOffset, width / 8, height / 4);
    } else {
      // Standing
      ctx.fillRect(-width / 4, height / 4, width / 8, height / 4);
      ctx.fillRect(width / 8, height / 4, width / 8, height / 4);
    }
  }
  
  // Head
  ctx.beginPath();
  ctx.arc(0, -height / 4 - height / 8, height / 8, 0, Math.PI * 2);
  ctx.fill();
  
  // Restore the context
  ctx.restore();
}

/**
 * Interpolate between two colors based on a factor
 */
function interpolateColor(color1: string, color2: string, factor: number): string {
  // Parse the colors
  const r1 = parseInt(color1.substring(1, 3), 16);
  const g1 = parseInt(color1.substring(3, 5), 16);
  const b1 = parseInt(color1.substring(5, 7), 16);
  
  const r2 = parseInt(color2.substring(1, 3), 16);
  const g2 = parseInt(color2.substring(3, 5), 16);
  const b2 = parseInt(color2.substring(5, 7), 16);
  
  // Interpolate
  const r = Math.round(r1 + factor * (r2 - r1));
  const g = Math.round(g1 + factor * (g2 - g1));
  const b = Math.round(b1 + factor * (b2 - b1));
  
  // Convert back to hex
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}