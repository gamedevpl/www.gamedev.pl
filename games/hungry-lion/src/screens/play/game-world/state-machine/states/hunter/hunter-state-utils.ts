import { HunterEntity, LionEntity } from '../../../entities/entities-types';
import { getLions } from '../../../game-world-query';
import { vectorDistance, vectorSubtract, vectorNormalize, vectorAngleBetween } from '../../../utils/math-utils';
import { StateContext } from '../../state-machine-types';

// Constants for hunter behavior
export const DETECTION_RANGE = 250; // Base detection range
export const AMBUSH_DETECTION_MODIFIER = 0.3; // Modifier for detecting lions in ambush state
export const FIELD_OF_VIEW = Math.PI / 1.5; // 120 degrees field of view
export const BASE_ACCURACY = 0.7; // Base shooting accuracy
export const MOVING_ACCURACY_PENALTY = 0.4; // Penalty to accuracy when lion is moving
export const DISTANCE_ACCURACY_MODIFIER = 0.5; // How much distance affects accuracy

/**
 * Move hunter towards a target position
 * @param entity Hunter entity
 * @param targetX Target X coordinate
 * @param targetY Target Y coordinate
 * @param acceleration Acceleration to use
 */
export function moveTowardsTarget(entity: HunterEntity, targetX: number, targetY: number, acceleration: number): void {
  const dx = targetX - entity.position.x;
  const dy = targetY - entity.position.y;

  entity.targetDirection = Math.atan2(dy, dx);
  entity.acceleration = acceleration;
}

/**
 * Detect if a lion is within range and visible to the hunter
 * @param entity Hunter entity
 * @param context State context
 * @returns The detected lion or undefined
 */
export function detectLion(entity: HunterEntity, context: StateContext<HunterEntity>): LionEntity | undefined {
  const lions = getLions(context.updateContext.gameState);
  
  // No lions to detect
  if (lions.length === 0) return undefined;
  
  // Check each lion
  for (const lion of lions) {
    const distance = vectorDistance(entity.position, lion.position);
    
    // Apply detection range modifier if lion is in ambush state
    const effectiveRange = lion.stateMachine[0] === 'LION_AMBUSH' 
      ? entity.detectionRange * AMBUSH_DETECTION_MODIFIER 
      : entity.detectionRange;
    
    // Check if lion is within detection range
    if (distance <= effectiveRange) {
      // Calculate direction to lion
      const directionVector = vectorSubtract(lion.position, entity.position);
      const normalizedDirection = vectorNormalize(directionVector);
      const hunterDirectionVector = { 
        x: Math.cos(entity.direction), 
        y: Math.sin(entity.direction) 
      };
      
      // Calculate angle between hunter's direction and direction to lion
      const angle = vectorAngleBetween(hunterDirectionVector, normalizedDirection);
      
      // Hunter can only detect lions within field of view
      if (angle <= FIELD_OF_VIEW / 2) {
        return lion;
      }
    }
  }
  
  return undefined;
}

/**
 * Calculate shooting accuracy based on various factors
 * @param hunter Hunter entity
 * @param lion Target lion entity
 * @returns Probability of hitting the target (0-1)
 */
export function calculateShootingAccuracy(hunter: HunterEntity, lion: LionEntity): number {
  // Start with base accuracy
  let accuracy = hunter.shootingAccuracy;
  
  // Adjust for distance
  const distance = vectorDistance(hunter.position, lion.position);
  const maxAccurateDistance = hunter.detectionRange * 0.6; // Maximum distance for full accuracy
  
  if (distance > maxAccurateDistance) {
    // Reduce accuracy based on distance
    const distanceFactor = 1 - Math.min((distance - maxAccurateDistance) / (hunter.detectionRange - maxAccurateDistance), 1);
    accuracy *= distanceFactor * DISTANCE_ACCURACY_MODIFIER + (1 - DISTANCE_ACCURACY_MODIFIER);
  }
  
  // Adjust for lion movement
  const lionIsMoving = lion.velocity.x !== 0 || lion.velocity.y !== 0;
  if (lionIsMoving) {
    accuracy *= MOVING_ACCURACY_PENALTY;
  }
  
  // Adjust for lion in ambush state
  if (lion.stateMachine[0] === 'LION_AMBUSH') {
    accuracy *= 0.5; // Harder to hit a lion in ambush
  }
  
  // Ensure accuracy is within valid range
  return Math.max(0.1, Math.min(accuracy, 1));
}

/**
 * Determine if hunter should retreat from a lion
 * @param hunter Hunter entity
 * @param lion Lion entity
 * @param minSafeDistance Minimum safe distance
 * @returns True if hunter should retreat
 */
export function shouldRetreat(hunter: HunterEntity, lion: LionEntity, minSafeDistance: number): boolean {
  const distance = vectorDistance(hunter.position, lion.position);
  
  // Retreat if lion is too close
  if (distance < minSafeDistance) {
    return true;
  }
  
  // Retreat if lion is charging directly at hunter
  const lionToHunterVector = vectorSubtract(hunter.position, lion.position);
  const lionDirectionVector = { 
    x: Math.cos(lion.direction), 
    y: Math.sin(lion.direction) 
  };
  
  const angle = vectorAngleBetween(lionDirectionVector, vectorNormalize(lionToHunterVector));
  
  // If lion is facing hunter and moving fast, retreat
  if (angle < Math.PI / 4 && vectorDistance(lion.velocity, { x: 0, y: 0 }) > 0.1) {
    return true;
  }
  
  return false;
}