import { PreyEntity } from './prey-types';
import { UpdateContext } from '../../../world-types';
import {
  PREY_HUNGER_DEATH,
  PREY_MAX_AGE_YEARS,
  PREY_INITIAL_HUNGER,
  EFFECT_DURATION_MEDIUM_HOURS,
  HOURS_PER_GAME_DAY,
  GAME_DAY_IN_REAL_SECONDS,
  HUMAN_YEAR_IN_REAL_SECONDS,
  PREY_MIN_PROCREATION_AGE,
} from '../../../world-consts';
import { removeEntity, createPrey, createPreyCorpse } from '../../entities-update';
import { addVisualEffect } from '../../../utils/visual-effects-utils';
import { VisualEffectType } from '../../../visual-effects/visual-effect-types';
import { playSoundAt } from '../../../sound/sound-manager';
import { SoundType } from '../../../sound/sound-types';
import { combineGenes } from './prey-utils';

/**
 * Updates a prey entity's stats and handles lifecycle events.
 */
export function preyUpdate(prey: PreyEntity, updateContext: UpdateContext, deltaTime: number): void {
  const gameHoursDelta = deltaTime * (HOURS_PER_GAME_DAY / GAME_DAY_IN_REAL_SECONDS);

  // Age the prey
  prey.age += deltaTime / HUMAN_YEAR_IN_REAL_SECONDS;

  prey.isAdult = prey.age >= PREY_MIN_PROCREATION_AGE;

  // Increase hunger over time
  let hungerIncrease = updateContext.gameState.ecosystem.preyHungerIncreasePerHour * gameHoursDelta;

  // Pregnancy increases hunger faster
  if (prey.isPregnant) {
    hungerIncrease *= 1.2;
  }

  prey.hunger += hungerIncrease;

  // Handle gestation for pregnant females
  if (prey.isPregnant && prey.gestationTime !== undefined) {
    prey.gestationTime -= gameHoursDelta;

    if (prey.gestationTime <= 0) {
      // Give birth - spawn a new prey nearby
      const birthPosition = {
        x: prey.position.x + (Math.random() - 0.5) * 40, // Random offset
        y: prey.position.y + (Math.random() - 0.5) * 40,
      };

      // Ensure birth position is within map bounds
      birthPosition.x = Math.max(20, Math.min(updateContext.gameState.mapDimensions.width - 20, birthPosition.x));
      birthPosition.y = Math.max(20, Math.min(updateContext.gameState.mapDimensions.height - 20, birthPosition.y));

      const childGender: 'male' | 'female' = Math.random() < 0.5 ? 'male' : 'female';

      // Get parents for genetic combination
      const mother = prey;
      const father = prey.fatherId
        ? (updateContext.gameState.entities.entities.get(prey.fatherId) as PreyEntity)
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

      const child = createPrey(
        updateContext.gameState.entities,
        birthPosition,
        childGender,
        0, // Start as baby
        PREY_INITIAL_HUNGER * 0.5, // Start with low hunger
        childGeneCode, // Combined genetic code
        prey.id, // Mother ID
        prey.fatherId, // Father ID from pregnancy
      );

      // Birth creates new life - child variable is used for entity creation
      void child;

      // Add birth visual effect
      addVisualEffect(
        updateContext.gameState,
        VisualEffectType.Procreation,
        prey.position,
        EFFECT_DURATION_MEDIUM_HOURS,
        prey.id,
      );

      // Play birth sound
      playSoundAt(updateContext, SoundType.Birth, prey.position);

      prey.isPregnant = false;
      prey.gestationTime = 0;
      prey.procreationCooldown = updateContext.gameState.ecosystem.preyProcreationCooldown;
      prey.fatherId = undefined; // Clear father reference
    }
  }

  // Decrease cooldowns
  if (prey.procreationCooldown && prey.procreationCooldown > 0) {
    prey.procreationCooldown -= gameHoursDelta;
    if (prey.procreationCooldown < 0) prey.procreationCooldown = 0;
  }

  if (prey.eatingCooldownTime && prey.eatingCooldownTime > updateContext.gameState.time) {
    // Cooldown still active, no action needed
  } else {
    prey.eatingCooldownTime = undefined;
  }

  if (prey.fleeCooldown && prey.fleeCooldown > 0) {
    prey.fleeCooldown -= gameHoursDelta;
    if (prey.fleeCooldown < 0) prey.fleeCooldown = 0;
  }

  if (prey.feedChildCooldownTime && prey.feedChildCooldownTime > 0) {
    prey.feedChildCooldownTime -= gameHoursDelta;
    if (prey.feedChildCooldownTime < 0) prey.feedChildCooldownTime = 0;
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
    // Create a corpse before removing the prey entity
    createPreyCorpse(
      updateContext.gameState.entities,
      prey.position,
      prey.gender,
      prey.age,
      prey.radius,
      prey.id,
      updateContext.gameState.time,
      prey.geneCode,
    );

    // Remove the prey entity from the world
    removeEntity(updateContext.gameState.entities, prey.id);
  }
}
