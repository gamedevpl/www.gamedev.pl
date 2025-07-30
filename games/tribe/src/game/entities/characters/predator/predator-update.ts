import { PredatorEntity } from './predator-types';
import { UpdateContext } from '../../../world-types';
import {
  PREDATOR_HUNGER_INCREASE_PER_HOUR,
  PREDATOR_HUNGER_DEATH,
  PREDATOR_MAX_AGE_YEARS,
  PREDATOR_INITIAL_HUNGER,
  EFFECT_DURATION_MEDIUM_HOURS,
} from '../../../world-consts';
import { removeEntity, createPredator } from '../../entities-update';
import { addVisualEffect } from '../../../utils/visual-effects-utils';
import { VisualEffectType } from '../../../visual-effects/visual-effect-types';
import { playSoundAt } from '../../../sound/sound-manager';
import { SoundType } from '../../../sound/sound-types';

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
      // Give birth - spawn a new predator nearby
      const birthPosition = {
        x: predator.position.x + (Math.random() - 0.5) * 50, // Random offset
        y: predator.position.y + (Math.random() - 0.5) * 50,
      };
      
      // Ensure birth position is within map bounds
      birthPosition.x = Math.max(25, Math.min(updateContext.gameState.mapDimensions.width - 25, birthPosition.x));
      birthPosition.y = Math.max(25, Math.min(updateContext.gameState.mapDimensions.height - 25, birthPosition.y));
      
      const childGender: 'male' | 'female' = Math.random() < 0.5 ? 'male' : 'female';
      
      const child = createPredator(
        updateContext.gameState.entities,
        birthPosition,
        childGender,
        0, // Start as baby
        PREDATOR_INITIAL_HUNGER * 0.6, // Start with moderate hunger
        predator.id, // Mother ID
        predator.fatherId, // Father ID from pregnancy
      );
      
      // Add birth visual effect
      addVisualEffect(
        updateContext.gameState,
        VisualEffectType.Birth,
        predator.position,
        EFFECT_DURATION_MEDIUM_HOURS,
        predator.id,
      );
      
      // Play birth sound
      playSoundAt(updateContext, SoundType.Birth, predator.position);
      
      predator.isPregnant = false;
      predator.gestationTime = 0;
      predator.procreationCooldown = 18; // 18 hours cooldown
      predator.fatherId = undefined; // Clear father reference
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