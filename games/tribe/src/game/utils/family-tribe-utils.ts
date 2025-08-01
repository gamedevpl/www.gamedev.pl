import { HUMAN_HUNGER_THRESHOLD_CRITICAL } from '../world-consts';
import { HumanEntity } from '../entities/characters/human/human-types';
import { EntityId } from '../entities/entities-types';
import { DiplomacyStatus, GameWorldState } from '../world-types';
import { IndexedWorldState } from '../world-index/world-index-types';
import { TribeInfo } from '../ui/ui-types';

export function countLivingOffspring(humanId: EntityId, gameState: GameWorldState): number {
  const indexedState = gameState as IndexedWorldState;
  const childrenAsMother = indexedState.search.human.byProperty('motherId', humanId);
  const childrenAsFather = indexedState.search.human.byProperty('fatherId', humanId);
  return childrenAsMother.length + childrenAsFather.length;
}

export function findPotentialNewPartners(
  sourceHuman: HumanEntity,
  gameState: GameWorldState,
  radius: number,
): HumanEntity[] {
  const indexedState = gameState as IndexedWorldState;
  const candidates = indexedState.search.human.byRadius(sourceHuman.position, radius);

  return candidates.filter((partner) => {
    if (
      partner.id === sourceHuman.id ||
      partner.gender === sourceHuman.gender ||
      !partner.isAdult ||
      partner.hunger >= HUMAN_HUNGER_THRESHOLD_CRITICAL ||
      (partner.procreationCooldown || 0) > 0 ||
      (partner.gender === 'female' && partner.isPregnant)
    ) {
      return false;
    }

    const isParentOfSource = partner.id === sourceHuman.motherId || partner.id === sourceHuman.fatherId;
    const isChildOfSource = sourceHuman.id === partner.motherId || sourceHuman.id === partner.fatherId;

    return !isParentOfSource && !isChildOfSource;
  });
}

export function findHeir(potentialHeirs: HumanEntity[]): HumanEntity | undefined {
  if (potentialHeirs.length === 0) {
    return undefined;
  }

  const males = potentialHeirs.filter((h) => h.gender === 'male');
  const females = potentialHeirs.filter((h) => h.gender === 'female');

  const sortFn = (a: HumanEntity, b: HumanEntity) => {
    if (a.age !== b.age) {
      return b.age - a.age;
    }
    return a.id - b.id;
  };

  males.sort(sortFn);
  if (males.length > 0) {
    return males[0];
  }

  females.sort(sortFn);
  if (females.length > 0) {
    return females[0];
  }

  return undefined;
}

export function findChildren(gameState: GameWorldState, parent: HumanEntity): HumanEntity[] {
  const indexedState = gameState as IndexedWorldState;
  const childrenAsMother = indexedState.search.human.byProperty('motherId', parent.id);
  const childrenAsFather = indexedState.search.human.byProperty('fatherId', parent.id);
  return [...childrenAsMother, ...childrenAsFather];
}

export function areFamily(human1: HumanEntity, human2: HumanEntity, gameState: GameWorldState): boolean {
  if (human1.id === human2.id) return true;

  // Check for parent/child relationship
  if (human1.motherId === human2.id || human1.fatherId === human2.id) return true;
  if (human2.motherId === human1.id || human2.fatherId === human1.id) return true;

  // Check for siblings (sharing at least one parent)
  const areSiblings =
    (human1.motherId && human1.motherId === human2.motherId) ||
    (human1.fatherId && human1.fatherId === human2.fatherId);
  if (areSiblings) return true;

  // Check for partnership
  if (human1.partnerIds?.includes(human2.id)) return true;

  // Check for grandparent/grandchild relationship (one is the parent of the other's parent)
  if (human1.motherId) {
    const mother = gameState.entities.entities.get(human1.motherId) as HumanEntity | undefined;
    if (mother && (mother.motherId === human2.id || mother.fatherId === human2.id)) return true;
  }
  if (human1.fatherId) {
    const father = gameState.entities.entities.get(human1.fatherId) as HumanEntity | undefined;
    if (father && (father.motherId === human2.id || father.fatherId === human2.id)) return true;
  }
  if (human2.motherId) {
    const mother = gameState.entities.entities.get(human2.motherId) as HumanEntity | undefined;
    if (mother && (mother.motherId === human1.id || mother.fatherId === human1.id)) return true;
  }
  if (human2.fatherId) {
    const father = gameState.entities.entities.get(human2.fatherId) as HumanEntity | undefined;
    if (father && (father.motherId === human1.id || father.fatherId === human1.id)) return true;
  }

  return false;
}

export function isLineage(human1: HumanEntity, human2: HumanEntity): boolean {
  if (human1.id === human2.id) return true;

  if (human1.motherId === human2.id || human1.fatherId === human2.id) return true;
  if (human2.motherId === human1.id || human2.fatherId === human1.id) return true;

  if (human1.partnerIds?.includes(human2.id) || human2.partnerIds?.includes(human1.id) || false) return true;

  if (human1.fatherId === undefined && human1.motherId === undefined) return false;
  if (human2.fatherId === undefined && human2.motherId === undefined) return false;

  const isChildOfHuman1 = human1.motherId === human2.motherId || human1.fatherId === human2.fatherId;
  const isChildOfHuman2 = human2.motherId === human1.motherId || human2.fatherId === human1.fatherId;

  const isCommonAncestor =
    human1.ancestorIds?.some((ancestorId) => human2.ancestorIds.includes(ancestorId)) ||
    human2.ancestorIds?.some((ancestorId) => human1.ancestorIds.includes(ancestorId));

  return isChildOfHuman1 || isChildOfHuman2 || isCommonAncestor;
}

export function findParents(human: HumanEntity, gameState: GameWorldState): HumanEntity[] {
  const parents: HumanEntity[] = [];
  if (human.motherId) {
    const mother = gameState.entities.entities.get(human.motherId) as HumanEntity | undefined;
    if (mother) {
      parents.push(mother);
    }
  }
  if (human.fatherId) {
    const father = gameState.entities.entities.get(human.fatherId) as HumanEntity | undefined;
    if (father) {
      parents.push(father);
    }
  }
  return parents;
}

export function findMalePartner(human: HumanEntity, gameState: GameWorldState): HumanEntity | null {
  if (human.gender !== 'female' || !human.partnerIds || human.partnerIds.length === 0) {
    return null;
  }
  for (const partnerId of human.partnerIds) {
    const partner = gameState.entities.entities.get(partnerId) as HumanEntity | undefined;
    if (partner && partner.gender === 'male') return partner;
  }
  return null;
}

export function findFamilyPatriarch(human: HumanEntity, gameState: GameWorldState): HumanEntity | null {
  // Children follow their father
  if (!human.isAdult && human.fatherId) {
    const father = gameState.entities.entities.get(human.fatherId) as HumanEntity | undefined;
    if (father && father.type === 'human') {
      return father;
    }
  }

  // Heir follows their father
  if (human.isAdult && human.fatherId) {
    const father = gameState.entities.entities.get(human.fatherId) as HumanEntity | undefined;

    if (father && father.type === 'human' && findHeir(findChildren(gameState, father))?.id === human.id) {
      return father;
    }
  }

  // Adult females follow their male partner
  if (human.isAdult && human.gender === 'female' && human.partnerIds && human.partnerIds.length > 0) {
    // This reuses the existing logic to find the first male partner
    return findMalePartner(human, gameState);
  }

  return null;
}

export function getFamilyMembers(human: HumanEntity, gameState: GameWorldState): HumanEntity[] {
  const family = new Set<HumanEntity>();

  // Add parents
  if (human.motherId) {
    const mother = gameState.entities.entities.get(human.motherId) as HumanEntity | undefined;
    if (mother) family.add(mother);
  }
  if (human.fatherId) {
    const father = gameState.entities.entities.get(human.fatherId) as HumanEntity | undefined;
    if (father) family.add(father);
  }

  // Add partners
  human.partnerIds?.forEach((id) => {
    const partner = gameState.entities.entities.get(id) as HumanEntity | undefined;
    if (partner) family.add(partner);
  });

  // Add children
  findChildren(gameState, human).forEach((child) => family.add(child));

  return Array.from(family);
}

export function findDescendants(human: HumanEntity, gameState: GameWorldState): HumanEntity[] {
  const descendants = new Map<EntityId, HumanEntity>();

  function find(currentHuman: HumanEntity) {
    const children = findChildren(gameState, currentHuman);
    for (const child of children) {
      if (!descendants.has(child.id)) {
        descendants.set(child.id, child);
        find(child); // Recurse
      }
    }
  }

  find(human);
  return Array.from(descendants.values());
}

export function findTribeMembers(leaderId: EntityId, gameState: GameWorldState): HumanEntity[] {
  const indexedState = gameState as IndexedWorldState;
  return indexedState.search.human.byProperty('leaderId', leaderId);
}

export function getTribesInfo(gameState: GameWorldState, playerLeaderId?: EntityId): TribeInfo[] {
  const tribes: Map<EntityId, { leaderId: EntityId; tribeBadge: string; members: HumanEntity[] }> = new Map();

  const humans = Array.from(gameState.entities.entities.values()).filter((e) => e.type === 'human') as HumanEntity[];

  for (const human of humans) {
    if (human.leaderId) {
      if (!tribes.has(human.leaderId)) {
        tribes.set(human.leaderId, {
          leaderId: human.leaderId,
          tribeBadge: human.tribeBadge || '?',
          members: [],
        });
      }
      tribes.get(human.leaderId)?.members.push(human);
    }
  }

  const playerDiplomacy = playerLeaderId
    ? (gameState.entities.entities.get(playerLeaderId) as HumanEntity | undefined)?.diplomacy
    : undefined;

  const tribeInfoList: TribeInfo[] = Array.from(tribes.values()).map((tribe) => {
    const leader = gameState.entities.entities.get(tribe.leaderId) as HumanEntity | undefined;
    const adultCount = tribe.members.filter((m) => m.isAdult).length;
    const childCount = tribe.members.length - adultCount;

    return {
      leaderId: tribe.leaderId,
      tribeBadge: tribe.tribeBadge,
      adultCount,
      childCount,
      isPlayerTribe: tribe.leaderId === playerLeaderId,
      leaderAge: leader?.age ?? 0,
      leaderGender: leader?.gender ?? 'male',
      diplomacyStatus: playerDiplomacy?.get(tribe.leaderId ?? -1) ?? DiplomacyStatus.Friendly,
    };
  });

  // Sort the list: player's tribe first, then by total member count descending
  tribeInfoList.sort((a, b) => {
    if (a.isPlayerTribe) return -1;
    if (b.isPlayerTribe) return 1;
    return b.adultCount + b.childCount - (a.adultCount + a.childCount);
  });

  return tribeInfoList;
}

export function getTribeForLeader(leaderId: EntityId, gameState: IndexedWorldState): HumanEntity[] {
  const tribeMembers = gameState.search.human.byProperty('leaderId', leaderId);
  const leader = gameState.entities.entities.get(leaderId) as HumanEntity | undefined;
  if (leader) {
    // Ensure the leader is included if they are managing their own tribe
    if (!tribeMembers.some((m) => m.id === leaderId)) {
      tribeMembers.push(leader);
    }
  }
  return tribeMembers;
}

export function getTribeMembers(human: HumanEntity, gameState: GameWorldState): HumanEntity[] {
  if (!human.leaderId) {
    return [];
  }
  const indexedState = gameState as IndexedWorldState;
  return indexedState.search.human.byProperty('leaderId', human.leaderId);
}
