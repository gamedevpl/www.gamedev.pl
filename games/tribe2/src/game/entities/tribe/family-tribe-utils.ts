import { HUMAN_HUNGER_THRESHOLD_CRITICAL, MAX_ANCESTORS_TO_TRACK } from '../../human-consts.ts';
import { HumanEntity } from '../characters/human/human-types.ts';
import { EntityId } from '../entities-types.ts';
import { DiplomacyStatus, GameWorldState } from '../../world-types.ts';
import { IndexedWorldState } from '../../world-index/world-index-types.ts';
import { TribeInfo } from '../../ui/ui-types.ts';
import { NotificationType } from '../../notifications/notification-types.ts';
import { addNotification } from '../../notifications/notification-utils.ts';
import { NOTIFICATION_DURATION_LONG_HOURS } from '../../notifications/notification-consts.ts';
import { startBuildingDestruction } from '../../utils/building-placement-utils.ts';

export function findPotentialNewPartners(
  sourceHuman: HumanEntity,
  gameState: GameWorldState,
  radius: number,
): HumanEntity[] {
  const indexedState = gameState as IndexedWorldState;
  const candidates = indexedState.search.human.byRadius(sourceHuman.position, radius);

  return candidates
    .filter((partner) => {
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

      const isChild = sourceHuman.motherId === partner.id || sourceHuman.fatherId === partner.id;
      if (isChild && !!partner.partnerIds?.length) {
        return false;
      }

      return true;
    })
    .sort((a, b) => {
      const isAParent = a.id === sourceHuman.motherId || a.id === sourceHuman.fatherId;
      const isAChild = sourceHuman.id === a.motherId || sourceHuman.id === a.fatherId;
      const isBParent = b.id === sourceHuman.motherId || b.id === sourceHuman.fatherId;
      const isBChild = sourceHuman.id === b.motherId || sourceHuman.id === b.fatherId;

      if (isAParent || isAChild) return 1;
      if (isBParent || isBChild) return -1;
      return a.age - b.age;
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
    const mother = gameState.entities.entities[human1.motherId] as HumanEntity | undefined;
    if (mother && (mother.motherId === human2.id || mother.fatherId === human2.id)) return true;
  }
  if (human1.fatherId) {
    const father = gameState.entities.entities[human1.fatherId] as HumanEntity | undefined;
    if (father && (father.motherId === human2.id || father.fatherId === human2.id)) return true;
  }
  if (human2.motherId) {
    const mother = gameState.entities.entities[human2.motherId] as HumanEntity | undefined;
    if (mother && (mother.motherId === human1.id || mother.fatherId === human1.id)) return true;
  }
  if (human2.fatherId) {
    const father = gameState.entities.entities[human2.fatherId] as HumanEntity | undefined;
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
    const mother = gameState.entities.entities[human.motherId] as HumanEntity | undefined;
    if (mother) {
      parents.push(mother);
    }
  }
  if (human.fatherId) {
    const father = gameState.entities.entities[human.fatherId] as HumanEntity | undefined;
    if (father) {
      parents.push(father);
    }
  }
  return parents;
}

function findMalePartner(human: HumanEntity, gameState: GameWorldState): HumanEntity | null {
  if (human.gender !== 'female' || !human.partnerIds || human.partnerIds.length === 0) {
    return null;
  }
  for (const partnerId of human.partnerIds) {
    const partner = gameState.entities.entities[partnerId] as HumanEntity | undefined;
    if (partner && partner.gender === 'male') return partner;
  }
  return null;
}

export function findFamilyPatriarch(human: HumanEntity, gameState: GameWorldState): HumanEntity | null {
  // Children follow their father
  if (!human.isAdult && human.fatherId) {
    const father = gameState.entities.entities[human.fatherId] as HumanEntity | undefined;
    if (father && father.type === 'human') {
      return father;
    }
  }

  // Heir follows their father
  if (human.isAdult && human.fatherId) {
    const father = gameState.entities.entities[human.fatherId] as HumanEntity | undefined;

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

export function findLivingFamilyRoot(human: HumanEntity, gameState: GameWorldState): HumanEntity {
  let current = human;
  const visited = new Set<EntityId>();
  visited.add(current.id);

  for (let i = 0; i < MAX_ANCESTORS_TO_TRACK; i++) {
    let next: HumanEntity | null = null;

    if (current.gender === 'female') {
      next = findMalePartner(current, gameState);
    }

    if (!next && current.fatherId) {
      next = (gameState.entities.entities[current.fatherId] as HumanEntity | undefined) || null;
    }

    if (!next || visited.has(next.id)) break;

    current = next;
    visited.add(current.id);
  }

  return current;
}

export function getFamilyMembers(human: HumanEntity, gameState: GameWorldState): HumanEntity[] {
  const family = new Set<HumanEntity>();

  // Add parents
  if (human.motherId) {
    const mother = gameState.entities.entities[human.motherId] as HumanEntity | undefined;
    if (mother) family.add(mother);
  }
  if (human.fatherId) {
    const father = gameState.entities.entities[human.fatherId] as HumanEntity | undefined;
    if (father) family.add(father);
  }

  // Add partners
  human.partnerIds?.forEach((id) => {
    const partner = gameState.entities.entities[id] as HumanEntity | undefined;
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

  const humans = Object.values(gameState.entities.entities).filter((e) => e.type === 'human') as HumanEntity[];

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
    ? (gameState.entities.entities[playerLeaderId] as HumanEntity | undefined)?.tribeControl?.diplomacy
    : undefined;

  const tribeInfoList: TribeInfo[] = Array.from(tribes.values()).map((tribe) => {
    const leader = gameState.entities.entities[tribe.leaderId] as HumanEntity | undefined;
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
      diplomacyStatus: playerDiplomacy?.[tribe.leaderId ?? -1] ?? DiplomacyStatus.Friendly,
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

export function getTribeMembers(human: HumanEntity, gameState: GameWorldState): HumanEntity[] {
  if (!human.leaderId) {
    return [];
  }
  const indexedState = gameState as IndexedWorldState;
  return indexedState.search.human.byProperty('leaderId', human.leaderId);
}

// --- New functions for Dynamic Heir Recalculation and Peaceful Tribe Merging ---

export function detectOrphanedTribes(gameState: GameWorldState): EntityId[] {
  const orphanedTribeLeaderIds: Set<EntityId> = new Set();

  // Iterate through all humans to find tribes
  const humans = Object.values(gameState.entities.entities).filter((e) => e.type === 'human') as HumanEntity[];

  // Group humans by leaderId
  const tribes = new Map<EntityId, HumanEntity[]>();
  for (const human of humans) {
    if (human.leaderId) {
      if (!tribes.has(human.leaderId)) {
        tribes.set(human.leaderId, []);
      }
      tribes.get(human.leaderId)?.push(human);
    }
  }

  // Check each tribe for validity
  for (const [leaderId, members] of tribes) {
    if (members.length === 0) continue;

    const leader = gameState.entities.entities[leaderId] as HumanEntity | undefined;

    // A tribe is orphaned if:
    // 1. The leader doesn't exist (died)
    // 2. The leader exists but has joined another tribe (leaderId !== id)
    const isLeaderDead = !leader;
    const isLeaderInAnotherTribe = leader && leader.leaderId !== leaderId;

    if (isLeaderDead || isLeaderInAnotherTribe) {
      orphanedTribeLeaderIds.add(leaderId);
    }
  }

  return Array.from(orphanedTribeLeaderIds);
}

function determineTribeMergeTarget(orphanedTribeLeaderId: EntityId, gameState: GameWorldState): EntityId | null {
  const members = findTribeMembers(orphanedTribeLeaderId, gameState);
  if (members.length === 0) return null;

  // If the leader is still alive but joined another tribe, that tribe is the primary target
  const oldLeader = gameState.entities.entities[orphanedTribeLeaderId] as HumanEntity | undefined;
  if (oldLeader && oldLeader.leaderId && oldLeader.leaderId !== oldLeader.id) {
    return oldLeader.leaderId;
  }

  // Otherwise, look for family connections
  const potentialTargets = new Map<EntityId, number>();

  for (const member of members) {
    const family = getFamilyMembers(member, gameState);
    for (const relative of family) {
      // If relative is in a different valid tribe
      if (
        relative.leaderId &&
        relative.leaderId !== orphanedTribeLeaderId &&
        relative.leaderId === relative.id // Ensure target is a tribe leader
      ) {
        // Stronger weight for close relations
        let weight = 1;
        if (relative.id === member.fatherId || relative.id === member.motherId) weight = 3;
        if (relative.partnerIds?.includes(member.id)) weight = 3;
        if (member.partnerIds?.includes(relative.id)) weight = 3;

        const currentScore = potentialTargets.get(relative.leaderId) || 0;
        potentialTargets.set(relative.leaderId, currentScore + weight);
      } else if (relative.leaderId && relative.leaderId !== orphanedTribeLeaderId) {
        // Relative is a member of another tribe
        const targetLeaderId = relative.leaderId;
        // Check if that leader is valid
        const targetLeader = gameState.entities.entities[targetLeaderId] as HumanEntity | undefined;
        if (targetLeader && targetLeader.leaderId === targetLeader.id) {
          let weight = 1;
          if (relative.id === member.fatherId || relative.id === member.motherId) weight = 2;
          if (relative.partnerIds?.includes(member.id)) weight = 2;
          if (member.partnerIds?.includes(relative.id)) weight = 2;

          const currentScore = potentialTargets.get(targetLeaderId) || 0;
          potentialTargets.set(targetLeaderId, currentScore + weight);
        }
      }
    }
  }

  // Find the tribe with the highest connection score
  let bestTargetId: EntityId | null = null;
  let maxScore = 0;

  for (const [targetId, score] of potentialTargets) {
    if (score > maxScore) {
      maxScore = score;
      bestTargetId = targetId;
    }
  }

  return bestTargetId;
}

function executeTribeMerge(fromTribeLeaderId: EntityId, toTribeLeaderId: EntityId, gameState: GameWorldState): void {
  const members = findTribeMembers(fromTribeLeaderId, gameState);
  const targetLeader = gameState.entities.entities[toTribeLeaderId] as HumanEntity | undefined;

  if (!targetLeader || !targetLeader.leaderId) return;

  const oldTribeBadge = members.length > 0 ? members[0].tribeBadge : '?';
  const newTribeBadge = targetLeader.tribeBadge;

  // Transfer members
  for (const member of members) {
    member.leaderId = toTribeLeaderId;
    member.tribeBadge = newTribeBadge;
    // Reset role, new leader will assign
    member.tribeRole = undefined;
  }

  // Transfer buildings
  const indexedState = gameState as IndexedWorldState;
  const buildings = indexedState.search.building.byProperty('ownerId', fromTribeLeaderId);
  for (const building of buildings) {
    building.ownerId = toTribeLeaderId;
  }

  // Merge diplomacy (simple approach: keep target's diplomacy, maybe add source's enemies?)
  // For now, we assume the merged tribe adopts the target tribe's politics completely.
  // If the source leader is still alive (e.g. joined the tribe), their personal diplomacy might matter,
  // but tribe diplomacy is stored on the leader.

  // Notification
  addNotification(gameState, {
    type: NotificationType.TribeMerged,
    message: `Tribe ${oldTribeBadge} has merged into Tribe ${newTribeBadge}!`,
    duration: NOTIFICATION_DURATION_LONG_HOURS,
    targetEntityIds: [toTribeLeaderId],
    highlightedEntityIds: [toTribeLeaderId, ...members.map((m) => m.id)],
  });
}

export function checkAndExecuteTribeMerges(gameState: GameWorldState): void {
  const orphanedTribes = detectOrphanedTribes(gameState);

  for (const orphanedTribeId of orphanedTribes) {
    const targetTribeId = determineTribeMergeTarget(orphanedTribeId, gameState);

    if (targetTribeId) {
      executeTribeMerge(orphanedTribeId, targetTribeId, gameState);
    } else {
      // Dissolve tribe if no target found
      const members = findTribeMembers(orphanedTribeId, gameState);
      for (const member of members) {
        member.leaderId = undefined;
        member.tribeBadge = undefined;
        member.tribeRole = undefined;
      }

      // Buildings also become abandoned
      const indexedState = gameState as IndexedWorldState;
      const buildings = indexedState.search.building.byProperty('ownerId', orphanedTribeId);
      for (const building of buildings) {
        startBuildingDestruction(building.id, gameState);
      }
    }
  }
}
