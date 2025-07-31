import { PredatorEntity } from './predator-types';
import { UpdateContext } from '../../../world-types';
import {
  PREDATOR_HUNGER_INCREASE_PER_HOUR,
  PREDATOR_HUNGER_DEATH,
  PREDATOR_MAX_AGE_YEARS,
  PREDATOR_INITIAL_HUNGER,
  EFFECT_DURATION_MEDIUM_HOURS,
  HOURS_PER_GAME_DAY,
  GAME_DAY_IN_REAL_SECONDS,
  HUMAN_YEAR_IN_REAL_SECONDS,
} from '../../../world-consts';
import { removeEntity, createPredator, createPredatorCorpse } from '../../entities-update';
import { addVisualEffect } from '../../../utils/visual-effects-utils';
import { VisualEffectType } from '../../../visual-effects/visual-effect-types';
import { playSoundAt } from '../../../sound/sound-manager';
import { SoundType } from '../../../sound/sound-types';
import { combineGenes } from './predator-utils';

/**
 * Updates a predator entity's stats and handles lifecycle events.
 */
export function predatorUpdate(predator: PredatorEntity, updateContext: UpdateContext, deltaTime: number): void {
  const gameHoursDelta = deltaTime * (HOURS_PER_GAME_DAY / GAME_DAY_IN_REAL_SECONDS);

  // Age the predator
  predator.age += deltaTime / HUMAN_YEAR_IN_REAL_SECONDS;

  // Increase hunger over time
  let hungerIncrease = PREDATOR_HUNGER_INCREASE_PER_HOUR * gameHoursDelta;

  // Pregnancy increases hunger faster
  if (predator.isPregnant) {
    hungerIncrease *= 1.3;
  }

  predator.hunger += hungerIncrease;

  // Handle gestation for pregnant females
  if (predator.isPregnant && predator.gestationTime !== undefined) {
    predator.gestationTime -= gameHoursDelta;

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

      // Get parents for genetic combination
      const mother = predator;
      const father = predator.fatherId
        ? (updateContext.gameState.entities.entities.get(predator.fatherId) as PredatorEntity)
        : undefined;

      // Generate child gene code by combining parents or using mother's genes with mutation
      let childGeneCode: number;
      if (father) {
        childGeneCode = combineGenes(mother.geneCode, father.geneCode);
      } else {
        // Use mother's genes with slight mutation if no father available
        childGeneCode = mother.geneCode;
        // Add some mutation
        const mutation = Math.floor((Math.random() - 0.5) * 0x1000);
        childGeneCode = Math.max(0x000000, Math.min(0xffffff, childGeneCode + mutation));
      }

      const child = createPredator(
        updateContext.gameState.entities,
        birthPosition,
        childGender,
        0, // Start as baby
        PREDATOR_INITIAL_HUNGER * 0.6, // Start with moderate hunger
        childGeneCode, // Combined genetic code
        predator.id, // Mother ID
        predator.fatherId, // Father ID from pregnancy
      );

      // Birth creates new life - child variable is used for entity creation
      void child;

      // Add birth visual effect
      addVisualEffect(
        updateContext.gameState,
        VisualEffectType.Procreation,
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
    predator.procreationCooldown -= gameHoursDelta;
    if (predator.procreationCooldown < 0) predator.procreationCooldown = 0;
  }

  if (predator.attackCooldown && predator.attackCooldown > 0) {
    predator.attackCooldown -= gameHoursDelta;
    if (predator.attackCooldown < 0) predator.attackCooldown = 0;
  }

  if (predator.huntCooldown && predator.huntCooldown > 0) {
    predator.huntCooldown -= gameHoursDelta;
    if (predator.huntCooldown < 0) predator.huntCooldown = 0;
  }

  if (predator.feedChildCooldownTime && predator.feedChildCooldownTime > 0) {
    predator.feedChildCooldownTime -= gameHoursDelta;
    if (predator.feedChildCooldownTime < 0) predator.feedChildCooldownTime = 0;
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
    // Create a corpse before removing the predator entity
    createPredatorCorpse(
      updateContext.gameState.entities,
      predator.position,
      predator.gender,
      predator.age,
      predator.radius,
      predator.id,
      updateContext.gameState.time,
      predator.geneCode,
    );

    // Remove the predator entity from the world
    removeEntity(updateContext.gameState.entities, predator.id);
  }
}
