import {
  GAME_DAY_IN_REAL_SECONDS,
  HOURS_PER_GAME_DAY,
  HUMAN_HUNGER_INCREASE_PER_HOUR,
  HUMAN_HUNGER_DEATH,
  CHILD_TO_ADULT_AGE,
  HUMAN_PREGNANCY_HUNGER_INCREASE_RATE_MODIFIER,
  CHILD_HUNGER_INCREASE_RATE_MODIFIER,
  HUMAN_FOOD_HUNGER_REDUCTION,
  HUMAN_OLD_AGE_THRESHOLD,
  HUMAN_OLD_PARENT_HUNGER_THRESHOLD_FOR_FEEDING,
  ADULT_CHILD_FEEDING_RANGE,
  ADULT_CHILD_FEED_PARENT_COOLDOWN_HOURS,
  HUMAN_YEAR_IN_REAL_SECONDS,
  HUNGER_EFFECT_THRESHOLD,
  EFFECT_DURATION_MEDIUM_HOURS,
  CHARACTER_CHILD_RADIUS,
  CHARACTER_RADIUS,
  HUMAN_BASE_HITPOINT_REGEN_PER_HOUR,
  HITPOINT_REGEN_HUNGER_MODIFIER,
  KARMA_ENEMY_THRESHOLD,
} from '../../../world-consts';
import { HumanEntity } from './human-types';
import { UpdateContext } from '../../../world-types';
import { createHumanCorpse, removeEntity } from '../../entities-update';
import { giveBirth } from '../../entities-update';
import { calculateWrappedDistance } from '../../../utils/math-utils';
import {
  findChildren,
  findHeir,
  generateTribeBadge,
  propagateNewLeaderToDescendants,
} from '../../../utils/world-utils';
import { addVisualEffect } from '../../../utils/visual-effects-utils';
import { VisualEffectType } from '../../../visual-effects/visual-effect-types';
import { decayKarma } from '../../../karma/karma-utils';

export function humanUpdate(entity: HumanEntity, updateContext: UpdateContext, deltaTime: number) {
  const { gameState } = updateContext;
  const gameHoursDelta = deltaTime * (HOURS_PER_GAME_DAY / GAME_DAY_IN_REAL_SECONDS);

  entity.isAdult = entity.age >= CHILD_TO_ADULT_AGE;

  decayKarma(entity, gameHoursDelta);

  // --- Tribe Leadership Checks ---
  if (entity.leaderId && entity.leaderId !== entity.id && entity.isAdult && entity.gender === 'male') {
    const leader = gameState.entities.entities.get(entity.leaderId) as HumanEntity | undefined;
    // Check if leader is dead or if karma is too low
    if (!leader || (entity.karma[entity.leaderId] ?? 0) <= KARMA_ENEMY_THRESHOLD) {
      entity.leaderId = entity.id; // Become own leader
      entity.tribeBadge = generateTribeBadge(); // Start a new tribe
      propagateNewLeaderToDescendants(entity, entity, gameState);
    }
  }

  // --- Hitpoint Regeneration -- -
  if (entity.hitpoints < entity.maxHitpoints) {
    const hungerFactor = 1 - (entity.hunger / 100) * HITPOINT_REGEN_HUNGER_MODIFIER;
    const regeneration = HUMAN_BASE_HITPOINT_REGEN_PER_HOUR * hungerFactor * gameHoursDelta;
    entity.hitpoints = Math.min(entity.maxHitpoints, entity.hitpoints + regeneration);
  }

  entity.hunger += deltaTime * (HUMAN_HUNGER_INCREASE_PER_HOUR / (HOURS_PER_GAME_DAY / GAME_DAY_IN_REAL_SECONDS));

  if (
    entity.hunger > HUNGER_EFFECT_THRESHOLD &&
    (!entity.lastHungerEffectTime || gameState.time - entity.lastHungerEffectTime > EFFECT_DURATION_MEDIUM_HOURS * 2)
  ) {
    addVisualEffect(gameState, VisualEffectType.Hunger, entity.position, EFFECT_DURATION_MEDIUM_HOURS, entity.id);
    entity.lastHungerEffectTime = gameState.time;
  }

  entity.age += deltaTime / HUMAN_YEAR_IN_REAL_SECONDS;

  if (entity.gender === 'female' && entity.isPregnant && entity.gestationTime) {
    entity.gestationTime -= gameHoursDelta;
    entity.hunger +=
      deltaTime *
      ((HUMAN_HUNGER_INCREASE_PER_HOUR * HUMAN_PREGNANCY_HUNGER_INCREASE_RATE_MODIFIER -
        HUMAN_HUNGER_INCREASE_PER_HOUR) /
        (HOURS_PER_GAME_DAY / GAME_DAY_IN_REAL_SECONDS));

    if (
      !entity.lastPregnantEffectTime ||
      gameState.time - entity.lastPregnantEffectTime > EFFECT_DURATION_MEDIUM_HOURS * 3
    ) {
      addVisualEffect(gameState, VisualEffectType.Pregnant, entity.position, EFFECT_DURATION_MEDIUM_HOURS, entity.id);
      entity.lastPregnantEffectTime = gameState.time;
    }

    if (entity.gestationTime <= 0) {
      giveBirth(entity, entity.fatherId, updateContext);
      entity.isPregnant = false;
      entity.gestationTime = 0;
      entity.fatherId = undefined;
    }
  }

  if (entity.procreationCooldown) {
    entity.procreationCooldown -= gameHoursDelta;
    if (entity.procreationCooldown < 0) entity.procreationCooldown = 0;
  }

  if (entity.attackCooldown) {
    entity.attackCooldown -= gameHoursDelta;
    if (entity.attackCooldown < 0) entity.attackCooldown = 0;
  }

  if (entity.feedParentCooldownTime) {
    entity.feedParentCooldownTime -= gameHoursDelta;
    if (entity.feedParentCooldownTime < 0) entity.feedParentCooldownTime = 0;
  }

  if (entity.feedChildCooldownTime) {
    entity.feedChildCooldownTime -= gameHoursDelta;
    if (entity.feedChildCooldownTime < 0) entity.feedChildCooldownTime = 0;
  }

  if (!entity.isAdult) {
    entity.hunger +=
      deltaTime *
      ((HUMAN_HUNGER_INCREASE_PER_HOUR * CHILD_HUNGER_INCREASE_RATE_MODIFIER - HUMAN_HUNGER_INCREASE_PER_HOUR) /
        (HOURS_PER_GAME_DAY / GAME_DAY_IN_REAL_SECONDS));
  } else if (entity.radius === CHARACTER_CHILD_RADIUS) {
    entity.radius = CHARACTER_RADIUS;
  }

  if (
    entity.isAdult &&
    entity.food.length > 0 &&
    (!entity.feedParentCooldownTime || entity.feedParentCooldownTime <= 0)
  ) {
    const parentsToFeed = [];
    if (entity.motherId) {
      const mother = gameState.entities.entities.get(entity.motherId) as HumanEntity | undefined;
      if (mother) parentsToFeed.push(mother);
    }
    if (entity.fatherId) {
      const father = gameState.entities.entities.get(entity.fatherId) as HumanEntity | undefined;
      if (father) parentsToFeed.push(father);
    }

    for (const parentEntity of parentsToFeed) {
      if (
        parentEntity.age >= HUMAN_OLD_AGE_THRESHOLD &&
        parentEntity.hunger >= HUMAN_OLD_PARENT_HUNGER_THRESHOLD_FOR_FEEDING
      ) {
        const distance = calculateWrappedDistance(
          entity.position,
          parentEntity.position,
          gameState.mapDimensions.width,
          gameState.mapDimensions.height,
        );
        if (distance <= ADULT_CHILD_FEEDING_RANGE) {
          entity.food.pop();
          parentEntity.hunger = Math.max(0, parentEntity.hunger - HUMAN_FOOD_HUNGER_REDUCTION);
          entity.feedParentCooldownTime = ADULT_CHILD_FEED_PARENT_COOLDOWN_HOURS;
          break;
        }
      }
    }
  }

  let causeOfDeath: string | undefined = undefined;
  if (entity.hitpoints <= 0) {
    causeOfDeath = 'killed';
  } else if (entity.hunger >= HUMAN_HUNGER_DEATH) {
    if (entity.food.length > 0 && entity.isAdult) {
      entity.food.pop();
      entity.hunger = Math.max(0, entity.hunger - HUMAN_FOOD_HUNGER_REDUCTION);
    } else {
      causeOfDeath = 'hunger';
    }
  } else if (entity.age >= entity.maxAge) {
    causeOfDeath = 'oldAge';
  }

  if (causeOfDeath) {
    // --- Leadership Succession on Death ---
    if (entity.leaderId === entity.id) {
      // The deceased was a leader
      const heir = findHeir(findChildren(gameState, entity));
      if (heir) {
        // Transfer leadership to the heir
        heir.leaderId = heir.id;
        heir.tribeBadge = entity.tribeBadge;

        // Update followers
        gameState.entities.entities.forEach((e) => {
          if (e.type === 'human' && (e as HumanEntity).leaderId === entity.id) {
            const follower = e as HumanEntity;
            if ((follower.karma[heir.id] ?? 0) > KARMA_ENEMY_THRESHOLD) {
              follower.leaderId = heir.id; // Follow the new leader
            } else {
              // Become their own leader due to bad karma with the heir
              follower.leaderId = follower.id;
              follower.tribeBadge = generateTribeBadge();
            }
          }
        });
      } else {
        // No heir, tribe dissolves
        gameState.entities.entities.forEach((e) => {
          if (e.type === 'human' && (e as HumanEntity).leaderId === entity.id) {
            const follower = e as HumanEntity;
            follower.leaderId = undefined;
            follower.tribeBadge = undefined;
          }
        });
      }
    }

    if (entity.isPlayer) {
      const oldestOffspring = findHeir(findChildren(gameState, entity));
      if (oldestOffspring) {
        oldestOffspring.isPlayer = true;
        gameState.generationCount++;
      } else {
        gameState.gameOver = true;
        gameState.causeOfGameOver = causeOfDeath;
      }
    }
    createHumanCorpse(
      gameState.entities,
      entity.position,
      entity.gender,
      entity.age,
      entity.radius,
      entity.id,
      gameState.time,
      entity.food,
      entity.hunger,
    );
    removeEntity(gameState.entities, entity.id);
    return;
  }

  if (entity.animationProgress === undefined) {
    entity.animationProgress = 0;
  }
  if (entity.animationSpeed === undefined) {
    entity.animationSpeed = 1;
  }

  entity.animationProgress += deltaTime * entity.animationSpeed;
  if (entity.animationProgress >= 1) {
    entity.animationProgress = 0;
  }
}
