import { PredatorEntity } from './predator-types';
import { UpdateContext } from '../../../world-types';
import {
  PREDATOR_HUNGER_INCREASE_PER_HOUR,
  PREDATOR_HUNGER_DEATH,
  PREDATOR_MAX_AGE_YEARS,
} from '../../../world-consts';
import { removeEntity } from '../../entities-update';

/**
 * Updates a predator entity's stats and handles lifecycle events.
 */
export function predatorUpdate(predator: PredatorEntity, updateContext: UpdateContext, deltaTime: number): void {
  const gameHoursElapsed = deltaTime;

  // Age the predator
  predator.age += gameHoursElapsed / 8760; // Convert hours to years (assuming 8760 hours per year)

  // Increase hunger over time
  let hungerIncrease = PREDATOR_HUNGER_INCREASE_PER_HOUR * gameHoursElapsed;
  
  // Pregnancy increases hunger faster
  if (predator.isPregnant) {
    hungerIncrease *= 1.3;
  }
  
  predator.hunger += hungerIncrease;

  // Handle gestation for pregnant females
  if (predator.isPregnant && predator.gestationTime !== undefined) {
    predator.gestationTime -= gameHoursElapsed;
    
    if (predator.gestationTime <= 0) {
      // Give birth (simplified - just spawn a new predator nearby)
      // This would normally create a new predator entity, but for now we just end pregnancy
      predator.isPregnant = false;
      predator.gestationTime = 0;
      predator.procreationCooldown = 18; // 18 hours cooldown
    }
  }

  // Decrease cooldowns
  if (predator.procreationCooldown && predator.procreationCooldown > 0) {
    predator.procreationCooldown -= gameHoursElapsed;
    if (predator.procreationCooldown < 0) predator.procreationCooldown = 0;
  }

  if (predator.attackCooldown && predator.attackCooldown > 0) {
    predator.attackCooldown -= gameHoursElapsed;
    if (predator.attackCooldown < 0) predator.attackCooldown = 0;
  }

  if (predator.huntCooldown && predator.huntCooldown > 0) {
    predator.huntCooldown -= gameHoursElapsed;
    if (predator.huntCooldown < 0) predator.huntCooldown = 0;
  }

  // Check for death conditions
  let shouldDie = false;
  
  if (predator.hunger >= PREDATOR_HUNGER_DEATH) {
    shouldDie = true;
  }
  
  if (predator.hitpoints <= 0) {
    shouldDie = true;
  }
  
  if (predator.age >= PREDATOR_MAX_AGE_YEARS) {
    shouldDie = true;
  }

  if (shouldDie) {
    // Remove the predator entity from the world
    removeEntity(updateContext.gameState.entities, predator.id);
  }
}