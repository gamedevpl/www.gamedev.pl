import { State, StateContext } from '../../../../state-machine/state-machine-types';
import { HumanEntity } from '../human-types';
import { HUMAN_PROCREATING, HUMAN_IDLE, HumanProcreatingStateData } from './human-state-types';
import { EntityId } from '../../../entities-types';
import {
  HUMAN_GESTATION_PERIOD_HOURS,
  HUMAN_PROCREATION_COOLDOWN_HOURS,
  HUMAN_HUNGER_THRESHOLD_CRITICAL,
} from '../../../../human-consts.ts';
import { playSoundAt } from '../../../../sound/sound-manager';
import { SoundType } from '../../../../sound/sound-types';

/**
 * Handles the procreation state for humans.
 * This state represents the process of two humans attempting to procreate.
 * If successful, the female becomes pregnant and both partners enter a cooldown period.
 */

const onEnter = (context: StateContext<HumanEntity>, data: HumanProcreatingStateData): HumanProcreatingStateData => {
  // Set the end time for the procreation process (default 2 seconds)
  data.procreationEndTime = context.updateContext.gameState.time + (data.duration || 2);
  return data;
};

const update = (data: HumanProcreatingStateData, context: StateContext<HumanEntity>) => {
  const { entity, updateContext } = context;
  const { gameState } = updateContext;

  // If the procreation process is still ongoing, continue in this state
  if (gameState.time < (data.procreationEndTime || 0)) {
    return { nextState: HUMAN_PROCREATING, data };
  }

  // Process is complete, check if procreation is successful
  const partner = gameState.entities.entities[data.partnerId as EntityId] as HumanEntity | undefined;

  if (
    partner &&
    partner.type === 'human' &&
    !partner.isPregnant &&
    entity.hunger < HUMAN_HUNGER_THRESHOLD_CRITICAL &&
    partner.hunger < HUMAN_HUNGER_THRESHOLD_CRITICAL &&
    !entity.procreationCooldown &&
    !partner.procreationCooldown
  ) {
    const female = entity.gender === 'female' ? entity : partner.gender === 'female' ? partner : undefined;
    const male = entity.gender === 'male' ? entity : partner.gender === 'male' ? partner : undefined;

    if (female && male) {
      female.isPregnant = true;
      female.gestationTime = HUMAN_GESTATION_PERIOD_HOURS;
      female.pregnancyFatherId = male.id;
      entity.procreationCooldown = HUMAN_PROCREATION_COOLDOWN_HOURS;
      partner.procreationCooldown = HUMAN_PROCREATION_COOLDOWN_HOURS;

      playSoundAt(updateContext, SoundType.Procreate, female.position);
    }
  }

  // Reset actions and return to idle state
  entity.activeAction = 'idle';
  if (partner) partner.activeAction = 'idle';

  return {
    nextState: HUMAN_IDLE,
    data: {
      ...data,
      enteredAt: gameState.time,
      previousState: HUMAN_PROCREATING,
    },
  };
};

export const humanProcreatingState: State<HumanEntity, HumanProcreatingStateData> = {
  id: HUMAN_PROCREATING,
  onEnter,
  update,
};
