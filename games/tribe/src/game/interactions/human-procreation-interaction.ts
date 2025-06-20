import { InteractionDefinition } from './interactions-types';
import { HumanEntity } from '../entities/characters/human/human-types';
import { UpdateContext } from '../world-types';
import { EntityType } from '../entities/entities-types';
import {
  HUMAN_INTERACTION_RANGE,
  HUMAN_HUNGER_THRESHOLD_CRITICAL,
  HUMAN_FEMALE_MAX_PROCREATION_AGE,
  KARMA_ON_INFIDELITY,
} from '../world-consts';
import { EFFECT_DURATION_MEDIUM_HOURS, EFFECT_DURATION_SHORT_HOURS } from '../world-consts';
import { HUMAN_PROCREATING, HumanProcreatingStateData } from '../entities/characters/human/states/human-state-types';
import { addVisualEffect } from '../utils/visual-effects-utils';
import { VisualEffectType } from '../visual-effects/visual-effect-types';
import { SoundType } from '../sound/sound-types';
import { playSoundAt } from '../sound/sound-manager';
import { applyKarma } from '../karma/karma-utils';

/**
 * Defines an interaction for human procreation.
 * This interaction allows two humans of opposite genders to attempt procreation
 * when they are within interaction range and meet all required conditions.
 */

const id = 'humanProcreation';
const sourceType = 'human' as EntityType;
const targetType = 'human' as EntityType;
const maxDistance = HUMAN_INTERACTION_RANGE;

const checker = (source: HumanEntity, target: HumanEntity): boolean => {
  // Prevent self-interaction
  if (source.id === target.id) return false;

  // Must be of opposite genders
  if (source.gender === target.gender) return false;

  // Helper function to check common eligibility criteria for an individual
  const isIndividuallyEligible = (entity: HumanEntity, isEntityFemale: boolean): boolean => {
    const commonConditions =
      entity.isAdult && entity.hunger < HUMAN_HUNGER_THRESHOLD_CRITICAL && (entity.procreationCooldown || 0) <= 0;

    if (!commonConditions) return false;

    if (isEntityFemale) {
      // Specific checks if the entity being checked is female
      return !entity.isPregnant && entity.age <= HUMAN_FEMALE_MAX_PROCREATION_AGE;
    }
    return true; // No further specific checks if the entity being checked is male
  };

  // Apply checks based on the source's gender
  if (source.gender === 'male') {
    // Source is MALE, Target is FEMALE
    // Check male's (source) eligibility
    if (!isIndividuallyEligible(source, false)) return false;
    // Check female's (target) eligibility
    if (!isIndividuallyEligible(target, true)) return false;

    // Male (source) must be 'procreating'. Female's (target) activeAction is not checked.
    return source.activeAction === 'procreating';
  } else {
    // source.gender === 'female'
    // Source is FEMALE, Target is MALE
    // Check female's (source) eligibility
    if (!isIndividuallyEligible(source, true)) return false;
    // Check male's (target) eligibility
    if (!isIndividuallyEligible(target, false)) return false;

    // Female (source) must be 'procreating', AND Male (target) must also be 'procreating'.
    return source.activeAction === 'procreating' && target.activeAction === 'procreating';
  }
};

const perform = (source: HumanEntity, target: HumanEntity, context: UpdateContext): void => {
  const { gameState } = context;
  const procreationPosition = {
    x: (source.position.x + target.position.x) / 2,
    y: (source.position.y + target.position.y) / 2,
  };

  // --- Karma Application for Infidelity --
  const sourceOriginalPartners = [...(source.partnerIds || [])];
  const targetOriginalPartners = [...(target.partnerIds || [])];

  // Both entities are initiators now, confirmed by the checker.
  // Set both entities to the procreating state
  source.stateMachine = [
    HUMAN_PROCREATING,
    {
      partnerId: target.id,
      previousState: source.stateMachine?.[0],
    } as HumanProcreatingStateData,
  ];

  target.stateMachine = [
    HUMAN_PROCREATING,
    {
      partnerId: source.id,
      previousState: target.stateMachine?.[0],
    } as HumanProcreatingStateData,
  ];

  // Update partnerIds for both entities
  if (!source.partnerIds) {
    source.partnerIds = [];
  }
  if (!source.partnerIds.includes(target.id)) {
    source.partnerIds.push(target.id);
  }

  if (!target.partnerIds) {
    target.partnerIds = [];
  }
  if (!target.partnerIds.includes(source.id)) {
    target.partnerIds.push(source.id);
  }

  // Apply karma penalty to slighted partners
  for (const originalPartnerId of sourceOriginalPartners) {
    if (originalPartnerId !== target.id) {
      const originalPartner = gameState.entities.entities.get(originalPartnerId) as HumanEntity | undefined;
      if (originalPartner) {
        applyKarma(source, originalPartner, KARMA_ON_INFIDELITY, gameState);
      }
    }
  }
  for (const originalPartnerId of targetOriginalPartners) {
    if (originalPartnerId !== source.id) {
      const originalPartner = gameState.entities.entities.get(originalPartnerId) as HumanEntity | undefined;
      if (originalPartner) {
        applyKarma(target, originalPartner, KARMA_ON_INFIDELITY, gameState);
      }
    }
  }

  // Clear active actions - the state machine will handle the behavior
  source.activeAction = undefined;

  // Add visual effects
  addVisualEffect(gameState, VisualEffectType.Procreation, procreationPosition, EFFECT_DURATION_MEDIUM_HOURS);
  addVisualEffect(gameState, VisualEffectType.Partnered, source.position, EFFECT_DURATION_SHORT_HOURS, source.id);
  addVisualEffect(gameState, VisualEffectType.Partnered, target.position, EFFECT_DURATION_SHORT_HOURS, target.id);
  source.lastPartneredEffectTime = gameState.time;
  target.lastPartneredEffectTime = gameState.time;
  target.activeAction = undefined;

  // Play procreation sound
  playSoundAt(context, SoundType.Procreate, procreationPosition);
};

export const humanProcreationInteraction: InteractionDefinition<HumanEntity, HumanEntity> = {
  id,
  sourceType,
  targetType,
  maxDistance,
  checker,
  perform,
};
