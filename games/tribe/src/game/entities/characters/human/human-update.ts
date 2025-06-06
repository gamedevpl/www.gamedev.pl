import {
  GAME_DAY_IN_REAL_SECONDS,
  HOURS_PER_GAME_DAY,
  HUMAN_HUNGER_INCREASE_PER_HOUR,
  HUMAN_HUNGER_DEATH,
  HUMAN_GESTATION_PERIOD_HOURS,
  CHILD_TO_ADULT_AGE,
  HUMAN_PREGNANCY_HUNGER_INCREASE_RATE_MODIFIER,
  CHILD_HUNGER_INCREASE_RATE_MODIFIER,
  HUMAN_BERRY_HUNGER_REDUCTION,
  HUMAN_OLD_AGE_THRESHOLD,
  HUMAN_OLD_PARENT_HUNGER_THRESHOLD_FOR_FEEDING,
  ADULT_CHILD_FEEDING_RANGE,
  ADULT_CHILD_FEED_PARENT_COOLDOWN_HOURS,
} from '../../../world-consts';
import { HumanEntity } from './human-types';
import { UpdateContext } from '../../../world-types';
import { removeEntity } from '../../entities-update';
import { giveBirth } from '../../entities-update';
import { calculateWrappedDistance } from '../../../utils/math-utils';

export function humanUpdate(entity: HumanEntity, updateContext: UpdateContext, deltaTime: number) {
  // Calculate game hours delta for time-based updates
  const gameHoursDelta = deltaTime * (HOURS_PER_GAME_DAY / GAME_DAY_IN_REAL_SECONDS);

  // Update adult status based on age
  entity.isAdult = entity.age >= CHILD_TO_ADULT_AGE;

  // Check for hunger increase (base rate)
  entity.hunger += deltaTime * (HUMAN_HUNGER_INCREASE_PER_HOUR / (HOURS_PER_GAME_DAY / GAME_DAY_IN_REAL_SECONDS));

  const realSecondsPerGestationPeriod = (HUMAN_GESTATION_PERIOD_HOURS / HOURS_PER_GAME_DAY) * GAME_DAY_IN_REAL_SECONDS;
  // Check for age increase
  entity.age += deltaTime / realSecondsPerGestationPeriod;

  // Handle pregnancy and gestation for females
  if (entity.gender === 'female' && entity.isPregnant && entity.gestationTime) {
    // Reduce gestation time
    entity.gestationTime -= gameHoursDelta;

    // Increase hunger at a higher rate during pregnancy
    entity.hunger +=
      deltaTime *
      ((HUMAN_HUNGER_INCREASE_PER_HOUR * HUMAN_PREGNANCY_HUNGER_INCREASE_RATE_MODIFIER -
        HUMAN_HUNGER_INCREASE_PER_HOUR) /
        (HOURS_PER_GAME_DAY / GAME_DAY_IN_REAL_SECONDS));

    // Check if gestation is complete
    if (entity.gestationTime <= 0) {
      // Give birth to a new human
      giveBirth(entity, entity.fatherId, updateContext);

      // Reset pregnancy state
      entity.isPregnant = false;
      entity.gestationTime = 0;
      entity.fatherId = undefined;
    }
  }

  // Handle procreation cooldown
  if (entity.procreationCooldown) {
    entity.procreationCooldown -= gameHoursDelta;
    if (entity.procreationCooldown < 0) entity.procreationCooldown = 0;
  }

  // Handle feed parent cooldown
  if (entity.feedParentCooldownTime) {
    entity.feedParentCooldownTime -= gameHoursDelta;
    if (entity.feedParentCooldownTime < 0) entity.feedParentCooldownTime = 0;
  }

  // Handle parent feed child cooldown
  if (entity.feedChildCooldownTime) {
    entity.feedChildCooldownTime -= gameHoursDelta;
    if (entity.feedChildCooldownTime < 0) entity.feedChildCooldownTime = 0;
  }

  // Handle child-specific updates
  if (!entity.isAdult) {
    // Child-specific hunger increase
    entity.hunger +=
      deltaTime *
      ((HUMAN_HUNGER_INCREASE_PER_HOUR * CHILD_HUNGER_INCREASE_RATE_MODIFIER - HUMAN_HUNGER_INCREASE_PER_HOUR) /
        (HOURS_PER_GAME_DAY / GAME_DAY_IN_REAL_SECONDS));

    // Implicit child feeding logic removed, now handled by humanChildFeedingInteraction
  }

  // Adult child feeds old parent logic
  if (entity.isAdult && entity.berries > 0 && (!entity.feedParentCooldownTime || entity.feedParentCooldownTime <= 0)) {
    for (const potentialParent of updateContext.gameState.entities.entities.values()) {
      if (potentialParent.type === 'human') {
        const parentEntity = potentialParent as HumanEntity;
        if (
          parentEntity.id !== entity.id &&
          (entity.motherId === parentEntity.id || entity.fatherId === parentEntity.id)
        ) {
          if (
            parentEntity.age >= HUMAN_OLD_AGE_THRESHOLD &&
            parentEntity.hunger >= HUMAN_OLD_PARENT_HUNGER_THRESHOLD_FOR_FEEDING
          ) {
            const distance = calculateWrappedDistance(
              entity.position,
              parentEntity.position,
              updateContext.gameState.mapDimensions.width,
              updateContext.gameState.mapDimensions.height,
            );
            if (distance <= ADULT_CHILD_FEEDING_RANGE) {
              entity.berries--;
              parentEntity.hunger = Math.max(0, parentEntity.hunger - HUMAN_BERRY_HUNGER_REDUCTION);
              entity.feedParentCooldownTime = ADULT_CHILD_FEED_PARENT_COOLDOWN_HOURS;
              break; // Feed only one parent per tick
            }
          }
        }
      }
    }
  }

  // Check for death conditions
  let causeOfDeath: string | undefined = undefined;
  if (entity.hunger >= HUMAN_HUNGER_DEATH) {
    if (entity.berries > 0 && entity.isAdult) {
      // Adults can auto-eat, children rely on parents
      // If the human has berries, they can eat one to reduce hunger
      // This is auto eat logic, not player-driven, because without it
      // The player would may forget to feed the human and they would die of hunger

      entity.berries--;
      entity.hunger = Math.max(0, entity.hunger - HUMAN_BERRY_HUNGER_REDUCTION);
      entity.eatingCooldownTime = updateContext.gameState.time + 1; // 1 second cooldown after eating
    } else {
      causeOfDeath = 'hunger';
    }
  } else if (entity.age >= entity.maxAge) {
    causeOfDeath = 'oldAge';
  }

  if (causeOfDeath) {
    // If this is the player character, handle generational transfer or game over
    if (entity.isPlayer) {
      // Try to find an offspring to transfer control to
      let oldestOffspring: HumanEntity | undefined = undefined;
      let maxAge = -1;

      // Iterate through all entities to find offspring
      for (const potentialOffspring of updateContext.gameState.entities.entities.values()) {
        if (potentialOffspring.type === 'human') {
          const human = potentialOffspring as HumanEntity;
          // Check if this human is an offspring of the deceased player
          if ((human.motherId === entity.id || human.fatherId === entity.id) && !human.isPlayer) {
            // If this offspring is older than our current oldest (or same age but lower ID for determinism)
            if (human.age > maxAge || (human.age === maxAge && human.id < (oldestOffspring?.id || Infinity))) {
              oldestOffspring = human;
              maxAge = human.age;
            }
          }
        }
      }

      // If we found a suitable offspring, transfer control
      if (oldestOffspring) {
        oldestOffspring.isPlayer = true;
        updateContext.gameState.generationCount++;
        // Game continues, so don't set gameOver flag
      } else {
        // No offspring found, game over
        updateContext.gameState.gameOver = true;
        updateContext.gameState.causeOfGameOver = causeOfDeath;
      }
    }

    // Remove the deceased entity
    removeEntity(updateContext.gameState.entities, entity.id);
    // No further updates for this entity as it's being removed
    return;
  }
}
