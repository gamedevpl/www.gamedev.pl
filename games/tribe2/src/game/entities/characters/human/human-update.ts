import { GAME_DAY_IN_REAL_SECONDS, HOURS_PER_GAME_DAY } from '../../../game-consts.ts';
import {
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
  HUMAN_BASE_HITPOINT_REGEN_PER_HOUR,
  HITPOINT_REGEN_HUNGER_MODIFIER,
  HUMAN_HUNGER_HEALTH_DRAIN_PER_HOUR,
} from '../../../human-consts.ts';
import { EFFECT_DURATION_MEDIUM_HOURS } from '../../../effect-consts.ts';
import { CHARACTER_CHILD_RADIUS, CHARACTER_RADIUS } from '../../../ui/ui-consts.ts';
import { HumanEntity } from './human-types';
import { IndexedWorldState } from '../../../world-index/world-index-types';
import { UpdateContext } from '../../../world-types';
import { createHumanCorpse, removeEntity } from '../../entities-update';
import { giveBirth } from '../../entities-update';
import { calculateWrappedDistance } from '../../../utils/math-utils';
import { findChildren, findHeir, replaceOwnerInTerrainOwnership, getTribesInfo } from '../../../utils/world-utils';
import { addVisualEffect } from '../../../utils/visual-effects-utils';
import { VisualEffectType } from '../../../visual-effects/visual-effect-types';
import { addNotification } from '../../../notifications/notification-utils';
import { NotificationType } from '../../../notifications/notification-types';
import { findDescendants } from '../../tribe/family-tribe-utils';
import { getTemperatureAt } from '../../../temperature/temperature-update';
import {
  COLD_THRESHOLD,
  HEALTH_DRAIN_PER_HOUR_PER_DEGREE_BELOW_THRESHOLD,
} from '../../../temperature/temperature-consts';
import { StrategicObjective } from '../../tribe/tribe-types';

export function humanUpdate(entity: HumanEntity, updateContext: UpdateContext, deltaTime: number) {
  const { gameState } = updateContext;
  const gameHoursDelta = deltaTime * (HOURS_PER_GAME_DAY / GAME_DAY_IN_REAL_SECONDS);

  entity.isAdult = entity.age >= CHILD_TO_ADULT_AGE;

  // --- Temperature Impact ---
  const localTemp = getTemperatureAt(
    gameState.temperature,
    entity.position,
    gameState.time,
    gameState.mapDimensions.width,
    gameState.mapDimensions.height,
  );

  if (localTemp < COLD_THRESHOLD) {
    const healthDrain =
      (COLD_THRESHOLD - localTemp) * HEALTH_DRAIN_PER_HOUR_PER_DEGREE_BELOW_THRESHOLD * gameHoursDelta;
    entity.hitpoints -= healthDrain;
  }

  // --- Movement Slowdown Cooldown ---
  if (entity.movementSlowdown && gameState.time > entity.movementSlowdown.endTime) {
    entity.movementSlowdown = undefined;
  }

  // --- Hitpoint Regeneration -- -
  if (entity.hitpoints < entity.maxHitpoints && entity.hunger < HUMAN_HUNGER_DEATH) {
    const hungerFactor = 1 - (entity.hunger / HUMAN_HUNGER_DEATH) * HITPOINT_REGEN_HUNGER_MODIFIER;
    const regeneration = HUMAN_BASE_HITPOINT_REGEN_PER_HOUR * hungerFactor * gameHoursDelta;
    entity.hitpoints = Math.min(entity.maxHitpoints, entity.hitpoints + regeneration);
  }

  entity.hunger += deltaTime * (HUMAN_HUNGER_INCREASE_PER_HOUR / (HOURS_PER_GAME_DAY / GAME_DAY_IN_REAL_SECONDS));

  if (entity.hunger >= HUMAN_HUNGER_DEATH) {
    if (entity.food.length > 0 && entity.isAdult) {
      entity.food.pop();
      entity.hunger = Math.max(0, entity.hunger - HUMAN_FOOD_HUNGER_REDUCTION);
    } else {
      const hungerDrain = HUMAN_HUNGER_HEALTH_DRAIN_PER_HOUR * gameHoursDelta;
      entity.hitpoints -= hungerDrain;
    }
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
      addVisualEffect(gameState, VisualEffectType.Pregnant, entity.position, EFFECT_DURATION_MEDIUM_HOURS, undefined, entity.id);
      entity.lastPregnantEffectTime = gameState.time;
    }

    if (entity.gestationTime <= 0) {
      giveBirth(entity, entity.pregnancyFatherId, updateContext);
      entity.isPregnant = false;
      entity.gestationTime = 0;
      entity.pregnancyFatherId = undefined;
    }
  }

  const leader = entity.leaderId ? (gameState.entities.entities[entity.leaderId] as HumanEntity | undefined) : undefined;
  const isBabyBoom = leader?.tribeControl?.strategicObjective === StrategicObjective.BabyBoom;
  const cooldownMultiplier = isBabyBoom ? 2 : 1;

  if (entity.procreationCooldown) {
    entity.procreationCooldown -= gameHoursDelta * cooldownMultiplier;
    if (entity.procreationCooldown < 0) entity.procreationCooldown = 0;
  }

  if (entity.attackCooldown) {
    entity.attackCooldown.melee -= gameHoursDelta;
    if (entity.attackCooldown.melee < 0) entity.attackCooldown.melee = 0;
    entity.attackCooldown.ranged -= gameHoursDelta;
    if (entity.attackCooldown.ranged < 0) entity.attackCooldown.ranged = 0;
  }

  if (entity.feedParentCooldownTime) {
    entity.feedParentCooldownTime -= gameHoursDelta;
    if (entity.feedParentCooldownTime < 0) entity.feedParentCooldownTime = 0;
  }

  if (entity.feedChildCooldownTime) {
    entity.feedChildCooldownTime -= gameHoursDelta * cooldownMultiplier;
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
      const mother = gameState.entities.entities[entity.motherId] as HumanEntity | undefined;
      if (mother) parentsToFeed.push(mother);
    }
    if (entity.fatherId) {
      const father = gameState.entities.entities[entity.fatherId] as HumanEntity | undefined;
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
    if (localTemp < COLD_THRESHOLD) {
      causeOfDeath = 'hypothermia';
    } else if (entity.hunger >= HUMAN_HUNGER_DEATH) {
      causeOfDeath = 'hunger';
    } else {
      causeOfDeath = 'killed';
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
        heir.tribeInfo = entity.tribeInfo;

        // Initialize or transfer tribe control
        heir.tribeControl = entity.tribeControl ?? {
          diplomacy: {},
        };

        const indexedState = gameState as IndexedWorldState;

        // Update territory ownership
        replaceOwnerInTerrainOwnership(gameState, entity.id, heir.id);

        // Update tribe members efficiently using index
        const members = indexedState.search.human.byProperty('leaderId', entity.id);
        for (const member of members) {
          member.leaderId = heir.id;
          member.tribeInfo = heir.tribeInfo;
        }

        // Update buildings efficiently using index
        const buildings = indexedState.search.building.byProperty('ownerId', entity.id);
        for (const building of buildings) {
          building.ownerId = heir.id;
        }

        // Ensure descendants are correctly linked (robustness for complex structures)
        for (const member of findDescendants(heir, gameState)) {
          member.leaderId = heir.id;
          member.tribeInfo = heir.tribeInfo;
        }

        // Update other tribes' diplomacy records to point to the new leader
        const otherTribes = getTribesInfo(gameState).filter((t) => t.leaderId !== heir.id && t.leaderId !== entity.id);
        for (const otherTribeInfo of otherTribes) {
          const otherLeader = gameState.entities.entities[otherTribeInfo.leaderId] as HumanEntity | undefined;
          if (otherLeader?.tribeControl?.diplomacy) {
            const status = otherLeader.tribeControl.diplomacy[entity.id];
            if (status !== undefined) {
              otherLeader.tribeControl.diplomacy[heir.id] = status;
              delete otherLeader.tribeControl.diplomacy[entity.id];
            }
          }
        }
      }
      // If no heir is found, we no longer manually dissolve the tribe here.
      // The global checkAndExecuteTribeMerges will handle dynastic rescue or dissolution.
    }

    if (entity.isPlayer) {
      const oldestOffspring = findHeir(findChildren(gameState, entity));
      if (oldestOffspring) {
        oldestOffspring.isPlayer = true;
        gameState.generationCount++;
      } else {
        gameState.gameOver = true;
        gameState.causeOfGameOver = causeOfDeath;
        // --- No Heir Notification ---
        addNotification(gameState, {
          identifier: 'no_heir',
          type: NotificationType.NoHeir,
          message: 'Your lineage has ended. You have no heir.',
          duration: 0, // Permanent
        });
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
