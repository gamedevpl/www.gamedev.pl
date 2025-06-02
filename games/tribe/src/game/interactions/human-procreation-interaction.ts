import { InteractionDefinition } from './interactions-types';
import { HumanEntity } from '../entities/characters/human/human-types';
import { UpdateContext } from '../world-types';
import { EntityType } from '../entities/entities-types';
import { HUMAN_INTERACTION_RANGE, HUMAN_HUNGER_THRESHOLD_CRITICAL } from '../world-consts';
import { HUMAN_PROCREATING, HumanProcreatingStateData } from '../entities/characters/human/states/human-state-types';

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

  // Both entities must be actively trying to procreate
  if (source.activeAction !== 'procreating' || target.activeAction !== 'procreating') {
    return false;
  }

  // Must be of opposite genders
  if (source.gender === target.gender) return false;

  // Identify male and female
  const female = source.gender === 'female' ? source : target;
  const male = source.gender === 'male' ? source : target;

  // This check is technically redundant if the gender check above is correct,
  // but ensures we have one of each.
  if (!male || !female || male.gender === female.gender) return false;

  // Check all conditions for procreation
  return (
    (male.isAdult &&
      female.isAdult &&
      male.hunger < HUMAN_HUNGER_THRESHOLD_CRITICAL &&
      female.hunger < HUMAN_HUNGER_THRESHOLD_CRITICAL &&
      (male.procreationCooldown || 0) <= 0 &&
      (female.procreationCooldown || 0) <= 0 &&
      !female.isPregnant) ||
    false
  );
};

const perform = (source: HumanEntity, target: HumanEntity, context: UpdateContext): void => {
  // Both entities are initiators now, confirmed by the checker.
  // Set both entities to the procreating state
  source.stateMachine = [
    HUMAN_PROCREATING,
    {
      partnerId: target.id,
      enteredAt: context.gameState.time,
      previousState: source.stateMachine?.[0],
    } as HumanProcreatingStateData,
  ];

  target.stateMachine = [
    HUMAN_PROCREATING,
    {
      partnerId: source.id,
      enteredAt: context.gameState.time,
      previousState: target.stateMachine?.[0],
    } as HumanProcreatingStateData,
  ];

  // Clear active actions - the state machine will handle the behavior
  source.activeAction = undefined;
  target.activeAction = undefined;
};

export const humanProcreationInteraction: InteractionDefinition<HumanEntity, HumanEntity> = {
  id,
  sourceType,
  targetType,
  maxDistance,
  checker,
  perform,
};
