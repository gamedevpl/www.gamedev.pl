import { Entity, Entities, HunterEntity, CarrionEntity, LionEntity } from './entities-types';
import { UpdateContext } from '../game-world-types';
import { createEntity } from './entities-update';
import { getLions } from '../game-world-query';
import { vectorDistance, vectorAngleBetween, vectorNormalize, vectorSubtract } from '../utils/math-utils';
import { createHunterStateMachine } from '../state-machine/states/hunter';
import { GAME_WORLD_WIDTH, GAME_WORLD_HEIGHT } from '../game-world-consts';

// Constants for hunter behavior
const HEALTH_DECREASE_RATE = 0.001; // Rate at which health decreases per millisecond when hungry
const DEFAULT_DETECTION_RANGE = 250; // Default range at which hunters can detect lions
const DEFAULT_SHOOTING_ACCURACY = 0.7; // Base accuracy for shooting (0-1)
const DEFAULT_AMMUNITION = 5; // Default ammunition for a hunter
const DEFAULT_RELOAD_TIME = 3000; // Default reload time in milliseconds
const AMBUSH_DETECTION_MODIFIER = 0.3; // Modifier for detecting lions in ambush state
const MOVING_ACCURACY_PENALTY = 0.4; // Penalty to accuracy when lion is moving
const DISTANCE_ACCURACY_MODIFIER = 0.5; // How much distance affects accuracy
const LION_DAMAGE = 15; // Damage done to lion when hit
const DEFAULT_PATROL_RADIUS = 50; // Default radius for patrol points
const NUM_PATROL_POINTS = 3; // Number of patrol points to generate
const PATROL_MARGIN = 100; // Margin from world edges for patrol points

/**
 * Updates hunter-specific state
 * @param entity The hunter entity
 * @param updateContext Update context
 * @param state Entities state
 */
export function hunterUpdate(entity: Entity, updateContext: UpdateContext, state: Entities) {
  const hunter = entity as HunterEntity;
  
  // Basic health decrease over time
  hunter.health = Math.max(hunter.health - HEALTH_DECREASE_RATE * updateContext.deltaTime, 0);
  
  // If health reaches zero, convert to carrion
  if (hunter.health <= 0) {
    state.entities.delete(hunter.id);
    createEntity<CarrionEntity>(state, 'carrion', {
      position: hunter.position,
      direction: hunter.direction,
      food: 75, // Hunters provide less food than prey
      decay: 100,
    });
    return;
  }

  // Update target lion detection
  if (hunter.targetLionId) {
    // Check if target lion still exists
    const targetLion = state.entities.get(hunter.targetLionId) as LionEntity | undefined;
    if (!targetLion || targetLion.type !== 'lion') {
      hunter.targetLionId = undefined;
    }
  }

  // Try to detect lions if not already targeting one
  if (!hunter.targetLionId) {
    const detectedLion = detectLion(hunter, updateContext);
    if (detectedLion) {
      hunter.targetLionId = detectedLion.id;
    }
  }
}

/**
 * Detects if a lion is within range and visible to the hunter
 * @param hunter The hunter entity
 * @param updateContext Update context
 * @returns The detected lion or undefined
 */
export function detectLion(hunter: HunterEntity, updateContext: UpdateContext): LionEntity | undefined {
  const lions = getLions(updateContext.gameState);
  
  // No lions to detect
  if (lions.length === 0) return undefined;
  
  // Check each lion
  for (const lion of lions) {
    const distance = vectorDistance(hunter.position, lion.position);
    
    // Apply detection range modifier if lion is in ambush state
    const effectiveRange = lion.stateMachine[0] === 'LION_AMBUSH' 
      ? hunter.detectionRange * AMBUSH_DETECTION_MODIFIER 
      : hunter.detectionRange;
    
    // Check if lion is within detection range
    if (distance <= effectiveRange) {
      // Calculate direction to lion
      const directionVector = vectorSubtract(lion.position, hunter.position);
      const normalizedDirection = vectorNormalize(directionVector);
      const hunterDirectionVector = { 
        x: Math.cos(hunter.direction), 
        y: Math.sin(hunter.direction) 
      };
      
      // Calculate angle between hunter's direction and direction to lion
      const angle = vectorAngleBetween(hunterDirectionVector, normalizedDirection);
      
      // Hunter can only detect lions within a 120-degree field of view
      const fieldOfView = Math.PI / 1.5; // 120 degrees
      
      if (angle <= fieldOfView / 2) {
        return lion;
      }
    }
  }
  
  return undefined;
}

/**
 * Attempts to shoot at a lion and calculates if the shot hits
 * @param hunter The hunter entity
 * @param lion The target lion
 * @param updateContext Update context
 * @returns True if the shot hits, false otherwise
 */
export function shootLion(hunter: HunterEntity, lion: LionEntity, updateContext: UpdateContext): boolean {
  // Check if hunter has ammunition
  if (hunter.ammunition <= 0) return false;
  
  // Reduce ammunition
  hunter.ammunition--;
  
  // Record shot time
  hunter.lastShotTime = updateContext.gameState.time;
  
  // Calculate base hit probability
  let hitProbability = hunter.shootingAccuracy;
  
  // Adjust for distance
  const distance = vectorDistance(hunter.position, lion.position);
  const maxAccurateDistance = hunter.detectionRange * 0.6; // Maximum distance for full accuracy
  
  if (distance > maxAccurateDistance) {
    // Reduce accuracy based on distance
    const distanceFactor = 1 - Math.min((distance - maxAccurateDistance) / (hunter.detectionRange - maxAccurateDistance), 1);
    hitProbability *= distanceFactor * DISTANCE_ACCURACY_MODIFIER + (1 - DISTANCE_ACCURACY_MODIFIER);
  }
  
  // Adjust for lion movement
  const lionIsMoving = lion.velocity.x !== 0 || lion.velocity.y !== 0;
  if (lionIsMoving) {
    hitProbability *= MOVING_ACCURACY_PENALTY;
  }
  
  // Adjust for lion in ambush state
  if (lion.stateMachine[0] === 'LION_AMBUSH') {
    hitProbability *= 0.5; // Harder to hit a lion in ambush
  }
  
  // Random chance to hit based on final probability
  const isHit = Math.random() < hitProbability;
  
  // If hit, apply damage to lion
  if (isHit) {
    // Lions don't have health, but we could add a damage system or just reduce hunger
    lion.hungerLevel = Math.max(lion.hungerLevel - LION_DAMAGE, 0);
  }
  
  return isHit;
}

/**
 * Generates a set of patrol points for a hunter
 * @param startPosition The starting position for generating patrol points
 * @param numPoints Number of patrol points to generate
 * @param maxDistance Maximum distance from start position
 * @returns Array of patrol points
 */
export function generatePatrolPoints(
  startPosition: { x: number, y: number },
  numPoints: number = NUM_PATROL_POINTS,
  maxDistance: number = 300
): { x: number, y: number }[] {
  const patrolPoints: { x: number, y: number }[] = [];
  
  // Always include the start position as the first patrol point
  patrolPoints.push({ ...startPosition });
  
  // Generate additional random points
  for (let i = 1; i < numPoints; i++) {
    // Generate a point within maxDistance of the start position
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * maxDistance;
    
    let x = startPosition.x + Math.cos(angle) * distance;
    let y = startPosition.y + Math.sin(angle) * distance;
    
    // Ensure the point is within the game world bounds
    x = Math.max(PATROL_MARGIN, Math.min(GAME_WORLD_WIDTH - PATROL_MARGIN, x));
    y = Math.max(PATROL_MARGIN, Math.min(GAME_WORLD_HEIGHT - PATROL_MARGIN, y));
    
    patrolPoints.push({ x, y });
  }
  
  return patrolPoints;
}

/**
 * Creates a new hunter entity
 * @param state Entities state
 * @param position Initial position
 * @returns The created hunter entity
 */
export function spawnHunter(state: Entities, position: { x: number, y: number }): HunterEntity {
  // Generate patrol points for the hunter
  const patrolPoints = generatePatrolPoints(position);
  
  return createEntity<HunterEntity>(state, 'hunter', {
    position: position,
    health: 100,
    ammunition: DEFAULT_AMMUNITION,
    reloadTime: DEFAULT_RELOAD_TIME,
    detectionRange: DEFAULT_DETECTION_RANGE,
    shootingAccuracy: DEFAULT_SHOOTING_ACCURACY,
    patrolPoints: patrolPoints,
    currentPatrolPointIndex: 0,
    patrolRadius: DEFAULT_PATROL_RADIUS,
    stateMachine: createHunterStateMachine(),
  });
}