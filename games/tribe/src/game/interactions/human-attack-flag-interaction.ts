import { InteractionDefinition } from './interactions-types';
import { HumanEntity } from '../entities/characters/human/human-types';
import { FlagEntity } from '../entities/flag/flag-types';
import { HUMAN_ATTACK_RANGE, HUMAN_ATTACK_DAMAGE } from '../world-consts';
import { removeEntity } from '../entities/entities-update';

export const humanAttackFlagInteraction: InteractionDefinition<HumanEntity, FlagEntity> = {
  id: 'human-attack-flag',
  sourceType: 'human',
  targetType: 'flag',
  maxDistance: HUMAN_ATTACK_RANGE,

  checker: (source, target) => {
    // A human can attack a flag if it doesn't belong to their own tribe
    // and they are in the 'attackingFlag' action state.
    return source.leaderId !== target.leaderId && source.activeAction === 'attackingFlag';
  },

  perform: (source, target, context) => {
    if ((source.attackCooldown || 0) > 0) {
      return; // Attacker is on cooldown
    }

    target.hitpoints -= HUMAN_ATTACK_DAMAGE;

    if (target.hitpoints <= 0) {
      removeEntity(context.gameState.entities, target.id);
    }

    // Put attacker on cooldown
    source.attackCooldown = 1; // Use a short cooldown for flag attacks

    // After attacking, the human goes back to idle
    source.activeAction = 'idle';
  },
};
