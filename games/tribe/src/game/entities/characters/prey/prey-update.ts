import { PreyEntity } from './prey-types';
import { UpdateContext } from '../../../world-types';
import {
  PREY_HUNGER_INCREASE_PER_HOUR,
  PREY_HUNGER_DEATH,
  PREY_MAX_AGE_YEARS,
} from '../../../world-consts';
import { removeEntity } from '../../entities-update';

/**
 * Updates a prey entity's stats and handles lifecycle events.
 */
export function preyUpdate(prey: PreyEntity, updateContext: UpdateContext, deltaTime: number): void {
  const gameHoursElapsed = deltaTime;

  // Age the prey
  prey.age += gameHoursElapsed / 8760; // Convert hours to years (assuming 8760 hours per year)

  // Increase hunger over time
  let hungerIncrease = PREY_HUNGER_INCREASE_PER_HOUR * gameHoursElapsed;
  
  // Pregnancy increases hunger faster
  if (prey.isPregnant) {
    hungerIncrease *= 1.2;
  }
  
  prey.hunger += hungerIncrease;

  // Handle gestation for pregnant females
  if (prey.isPregnant && prey.gestationTime !== undefined) {
    prey.gestationTime -= gameHoursElapsed;
    
    if (prey.gestationTime <= 0) {
      // Give birth (simplified - just spawn a new prey nearby)
      // This would normally create a new prey entity, but for now we just end pregnancy
      prey.isPregnant = false;
      prey.gestationTime = 0;
      prey.procreationCooldown = 12; // 12 hours cooldown
    }
  }

  // Decrease cooldowns
  if (prey.procreationCooldown && prey.procreationCooldown > 0) {
    prey.procreationCooldown -= gameHoursElapsed;
    if (prey.procreationCooldown < 0) prey.procreationCooldown = 0;
  }

  if (prey.eatingCooldownTime && prey.eatingCooldownTime > updateContext.gameState.time) {
    // Cooldown still active, no action needed
  } else {
    prey.eatingCooldownTime = undefined;
  }

  if (prey.fleeCooldown && prey.fleeCooldown > 0) {
    prey.fleeCooldown -= gameHoursElapsed;
    if (prey.fleeCooldown < 0) prey.fleeCooldown = 0;
  }

  // Check for death conditions
  let shouldDie = false;
  
  if (prey.hunger >= PREY_HUNGER_DEATH) {
    shouldDie = true;
  }
  
  if (prey.hitpoints <= 0) {
    shouldDie = true;
  }
  
  if (prey.age >= PREY_MAX_AGE_YEARS) {
    shouldDie = true;
  }

  if (shouldDie) {
    // Remove the prey entity from the world
    removeEntity(updateContext.gameState.entities, prey.id);
  }
}