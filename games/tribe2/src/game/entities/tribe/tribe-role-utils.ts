import { IndexedWorldState } from '../../world-index/world-index-types';
import { GameWorldState } from '../../world-types';
import { HumanEntity } from '../characters/human/human-types';
import { TRIBE_ROLES_EFFECTIVE_MIN_HEADCOUNT } from './tribe-consts';
import { TribeRole } from './tribe-types';

export function isTribeRole(human: HumanEntity, role: TribeRole, gameState: GameWorldState): boolean {
  if (!areTribeRolesEffective(human, gameState)) {
    return true;
  }

  return human.tribeRole === role;
}

export function areTribeRolesEffective(human: HumanEntity, gameState: GameWorldState): boolean {
  if (!human.leaderId) {
    return false;
  }

  const leader = gameState.entities.entities[human.leaderId] as HumanEntity | undefined;
  if (!leader || !leader.tribeControl) {
    return false;
  }

  const tribeMembers = (gameState as IndexedWorldState).search.human
    .byProperty('leaderId', leader.id)
    .filter((e) => e.isAdult).length;
  return tribeMembers >= TRIBE_ROLES_EFFECTIVE_MIN_HEADCOUNT;
}
