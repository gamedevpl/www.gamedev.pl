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
import { replaceOwnerInTerrainOwnership } from './territory-utils.ts';
import { generateTribeBadge } from '../../utils/general-utils';
import { TERRITORY_COLORS, TERRITORY_OWNERSHIP_RESOLUTION } from './territory-consts';
import { getDirectionVectorOnTorus } from '../../utils/math-utils';

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
  if (!human.isAdult) {
    if (human.fatherId) {
      const father = gameState.entities.entities[human.fatherId] as HumanEntity | undefined;
      if (father && father.type === 'human') {
        return father;
      }
    }
    // Fallback to mother for children
    if (human.motherId) {
      const mother = gameState.entities.entities[human.motherId] as HumanEntity | undefined;
      if (mother && mother.type === 'human') {
        return mother;
      }
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

/**
 * Recursive helper to find the top-most living ancestor.
 * If a father is dead or missing, the current entity is considered the root.
 */
export function getTopLivingAncestor(
  entityId: EntityId,
  gameState: GameWorldState,
  cache = new Map<EntityId, EntityId>(),
  visited = new Set<EntityId>(),
): EntityId {
  // 1. Check Cache
  if (cache.has(entityId)) {
    return cache.get(entityId)!;
  }

  // 2. Cycle detection (safety for malformed trees)
  if (visited.has(entityId)) {
    return entityId;
  }
  visited.add(entityId);

  const entity = gameState.entities.entities[entityId] as HumanEntity | undefined;

  // 3. If entity is missing (dead), we can't trace up.
  if (!entity) return entityId;

  // 4. Trace up: If female and has living male partner, join his family
  if (entity.gender === 'female' && entity.partnerIds?.length) {
    const malePartnerId = entity.partnerIds.find((id) => {
      const partner = gameState.entities.entities[id] as HumanEntity | undefined;
      return partner && partner.gender === 'male';
    });

    if (malePartnerId) {
      const rootAncestor = getTopLivingAncestor(malePartnerId, gameState, cache, visited);
      cache.set(entityId, rootAncestor);
      return rootAncestor;
    }
  }

  // 5. Trace up: If father exists and is ALIVE (in entities), recurse.
  if (entity.fatherId && gameState.entities.entities[entity.fatherId]) {
    const rootAncestor = getTopLivingAncestor(entity.fatherId, gameState, cache, visited);
    cache.set(entityId, rootAncestor);
    return rootAncestor;
  }

  // 6. No living father found; this entity is the patriarch.
  cache.set(entityId, entityId);
  return entityId;
}

/**
 * Promotes a human to tribe leader, inheriting info and control from the old leader if available.
 */
export function promoteToLeader(human: HumanEntity, oldLeader?: HumanEntity): void {
  human.leaderId = human.id;

  if (oldLeader) {
    human.tribeInfo = oldLeader.tribeInfo;
    human.tribeControl = oldLeader.tribeControl ?? {
      diplomacy: {},
    };
  }

  if (!human.tribeInfo) {
    human.tribeInfo = {
      tribeBadge: generateTribeBadge(),
      tribeColor: TERRITORY_COLORS[Math.floor(Math.random() * TERRITORY_COLORS.length)],
    };
  }

  if (!human.tribeControl) {
    human.tribeControl = {
      diplomacy: {},
    };
  }
}

/**
 * Finds the best candidate for internal leadership among orphaned members.
 * Identifies the patriarch of the largest family group present in the tribe.
 */
export function findInternalSuccessor(members: HumanEntity[], gameState: GameWorldState): HumanEntity | null {
  if (members.length === 0) return null;

  const ancestorCache = new Map<EntityId, EntityId>();
  const familyGroups = new Map<EntityId, HumanEntity[]>();

  for (const member of members) {
    const patriarchId = getTopLivingAncestor(member.id, gameState, ancestorCache);

    if (!familyGroups.has(patriarchId)) {
      familyGroups.set(patriarchId, []);
    }
    familyGroups.get(patriarchId)!.push(member);
  }

  // Find the family with the most members
  let bestPatriarchId: EntityId | null = null;
  let maxCount = 0;

  for (const [patriarchId, group] of familyGroups.entries()) {
    if (group.length > maxCount) {
      maxCount = group.length;
      bestPatriarchId = patriarchId;
    }
  }

  if (!bestPatriarchId) return null;
  return (gameState.entities.entities[bestPatriarchId] as HumanEntity) || null;
}

export function getTribesInfo(gameState: GameWorldState, playerLeaderId?: EntityId): TribeInfo[] {
  // 1. Group owned indices by tribe
  const ownershipByTribe = new Map<EntityId, number[]>();
  for (let i = 0; i < gameState.terrainOwnership.length; i++) {
    const ownerId = gameState.terrainOwnership[i];
    if (ownerId !== null) {
      if (!ownershipByTribe.has(ownerId)) {
        ownershipByTribe.set(ownerId, []);
      }
      ownershipByTribe.get(ownerId)!.push(i);
    }
  }

  const { width: worldWidth, height: worldHeight } = gameState.mapDimensions;
  const gridWidth = Math.ceil(worldWidth / TERRITORY_OWNERSHIP_RESOLUTION);

  const tribes: Map<
    EntityId,
    { leaderId: EntityId; tribeInfo?: { tribeBadge: string; tribeColor: string }; members: HumanEntity[] }
  > = new Map();

  const humans = Object.values(gameState.entities.entities).filter((e) => e.type === 'human') as HumanEntity[];

  for (const human of humans) {
    if (human.leaderId) {
      if (!tribes.has(human.leaderId)) {
        tribes.set(human.leaderId, {
          leaderId: human.leaderId,
          tribeInfo: human.tribeInfo,
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

    // Calculate centroid of territory
    const ownedIndices = ownershipByTribe.get(tribe.leaderId) || [];
    let territoryCenter = leader?.position; // Fallback to leader position

    if (ownedIndices.length > 0) {
      const firstIdx = ownedIndices[0];
      const refX = (firstIdx % gridWidth) * TERRITORY_OWNERSHIP_RESOLUTION;
      const refY = Math.floor(firstIdx / gridWidth) * TERRITORY_OWNERSHIP_RESOLUTION;
      const reference = { x: refX, y: refY };

      let sumDX = 0;
      let sumDY = 0;

      for (const idx of ownedIndices) {
        const x = (idx % gridWidth) * TERRITORY_OWNERSHIP_RESOLUTION;
        const y = Math.floor(idx / gridWidth) * TERRITORY_OWNERSHIP_RESOLUTION;
        const offset = getDirectionVectorOnTorus(reference, { x, y }, worldWidth, worldHeight);
        sumDX += offset.x;
        sumDY += offset.y;
      }

      const avgDX = sumDX / ownedIndices.length;
      const avgDY = sumDY / ownedIndices.length;

      territoryCenter = {
        x: (((reference.x + avgDX) % worldWidth) + worldWidth) % worldWidth,
        y: (((reference.y + avgDY) % worldHeight) + worldHeight) % worldHeight,
      };
    }

    return {
      leaderId: tribe.leaderId,
      tribeBadge: tribe?.tribeInfo?.tribeBadge || '',
      tribeColor: tribe?.tribeInfo?.tribeColor || '',
      adultCount,
      childCount,
      isPlayerTribe: tribe.leaderId === playerLeaderId,
      leaderAge: leader?.age ?? 0,
      leaderGender: leader?.gender ?? 'male',
      diplomacyStatus: playerDiplomacy?.[tribe.leaderId ?? -1] ?? DiplomacyStatus.Friendly,
      territoryCenter,
      strategicObjective: leader?.tribeControl?.strategicObjective,
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

  const indexedState = gameState as IndexedWorldState;
  const humans = indexedState.search.human.all();

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

  // Also check for tribes that exist in territory but have no members (extinct)
  for (let i = 0; i < gameState.terrainOwnership.length; i++) {
    const ownerId = gameState.terrainOwnership[i];
    if (ownerId !== null && !tribes.has(ownerId)) {
      orphanedTribeLeaderIds.add(ownerId);
    }
  }

  return Array.from(orphanedTribeLeaderIds);
}

/**
 * Calculates extended family members and their connection weights.
 * Immediate: 3, Blood Lineage: 2, In-laws: 1
 */
export function getExtendedFamilyMembers(human: HumanEntity, gameState: GameWorldState): Map<HumanEntity, number> {
  const relatives = new Map<HumanEntity, number>();
  const indexedState = gameState as IndexedWorldState;
  const allHumans = indexedState.search.human.all();

  // 1. Immediate Family (Weight 3)
  const immediate = getFamilyMembers(human, gameState);
  for (const relative of immediate) {
    relatives.set(relative, 3);
  }

  // 2. Blood Lineage (Weight 2)
  for (const other of allHumans) {
    if (other.id === human.id || relatives.has(other)) continue;
    if (isLineage(human, other)) {
      relatives.set(other, 2);
    }
  }

  // 3. In-laws (Weight 1) - Partners of blood relatives
  const bloodRelatives = Array.from(relatives.keys());
  for (const relative of bloodRelatives) {
    if (relative.partnerIds) {
      for (const partnerId of relative.partnerIds) {
        const partner = gameState.entities.entities[partnerId] as HumanEntity | undefined;
        if (partner && !relatives.has(partner) && partner.id !== human.id) {
          relatives.set(partner, 1);
        }
      }
    }
  }

  return relatives;
}

function determineTribeMergeTarget(orphanedTribeLeaderId: EntityId, gameState: GameWorldState): EntityId | null {
  const members = findTribeMembers(orphanedTribeLeaderId, gameState);
  if (members.length === 0) return null;

  // If the leader is still alive but joined another tribe, that tribe is the primary target
  const oldLeader = gameState.entities.entities[orphanedTribeLeaderId] as HumanEntity | undefined;
  if (oldLeader && oldLeader.leaderId && oldLeader.leaderId !== oldLeader.id) {
    return oldLeader.leaderId;
  }

  // Look for family connections with weighting
  const potentialTargets = new Map<EntityId, number>();

  for (const member of members) {
    const extendedFamily = getExtendedFamilyMembers(member, gameState);
    for (const [relative, weight] of extendedFamily) {
      if (relative.leaderId && relative.leaderId !== orphanedTribeLeaderId) {
        const targetLeaderId = relative.leaderId;
        const targetLeader = gameState.entities.entities[targetLeaderId] as HumanEntity | undefined;

        // Ensure target tribe is valid (leader points to self)
        if (targetLeader && targetLeader.leaderId === targetLeader.id) {
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
  let targetLeader = gameState.entities.entities[toTribeLeaderId] as HumanEntity | undefined;

  if (!targetLeader) return;

  if (targetLeader.leaderId && gameState.entities.entities[targetLeader.leaderId]) {
    toTribeLeaderId = targetLeader.leaderId;
    targetLeader = gameState.entities.entities[toTribeLeaderId] as HumanEntity | undefined;
  }

  if (!targetLeader) return;

  const oldTribeBadge = members.length > 0 ? members[0].tribeInfo?.tribeBadge : '?';
  const isInternal = targetLeader.leaderId === fromTribeLeaderId || !targetLeader.leaderId;

  if (isInternal) {
    const oldLeader = gameState.entities.entities[fromTribeLeaderId] as HumanEntity | undefined;
    promoteToLeader(targetLeader, oldLeader);
  }

  const newTribeBadge = targetLeader.tribeInfo?.tribeBadge ?? '?';

  // Transfer members
  for (const member of members) {
    if (member.id === toTribeLeaderId) continue;
    member.leaderId = toTribeLeaderId;
    member.tribeInfo = targetLeader.tribeInfo;
  }

  // Transfer buildings
  const indexedState = gameState as IndexedWorldState;
  const buildings = indexedState.search.building.byProperty('ownerId', fromTribeLeaderId);
  for (const building of buildings) {
    building.ownerId = toTribeLeaderId;
  }

  // Transfer territory
  replaceOwnerInTerrainOwnership(gameState, fromTribeLeaderId, toTribeLeaderId);

  // Notification
  addNotification(gameState, {
    identifier: `tribe-merge-${fromTribeLeaderId}`,
    type: NotificationType.TribeMerged,
    message: isInternal
      ? `Tribe ${oldTribeBadge} has a new leader!`
      : `Tribe ${oldTribeBadge} has merged into Tribe ${newTribeBadge}!`,
    duration: NOTIFICATION_DURATION_LONG_HOURS,
    targetEntityIds: [toTribeLeaderId],
    highlightedEntityIds: [toTribeLeaderId, ...members.map((m) => m.id)],
  });
}

export function checkAndExecuteTribeMerges(gameState: GameWorldState): void {
  const orphanedTribes = detectOrphanedTribes(gameState);

  for (const orphanedTribeId of orphanedTribes) {
    const members = findTribeMembers(orphanedTribeId, gameState);

    if (members.length === 0) {
      // Dissolve tribe if extinct
      // Buildings also become abandoned
      const indexedState = gameState as IndexedWorldState;
      const buildings = indexedState.search.building.byProperty('ownerId', orphanedTribeId);
      for (const building of buildings) {
        startBuildingDestruction(building.id, gameState);
      }

      // Clear territory
      replaceOwnerInTerrainOwnership(gameState, orphanedTribeId, null);

      // Notification
      addNotification(gameState, {
        identifier: `tribe-dissolved-${orphanedTribeId}`,
        type: NotificationType.TribeMerged,
        message: `An extinct tribe has been dissolved.`,
        duration: NOTIFICATION_DURATION_LONG_HOURS,
      });
      continue;
    }

    // 1. Try internal succession
    const internalSuccessor = findInternalSuccessor(members, gameState);
    if (internalSuccessor) {
      executeTribeMerge(orphanedTribeId, internalSuccessor.id, gameState);
      continue;
    }

    // 2. Try external merge
    const targetTribeId = determineTribeMergeTarget(orphanedTribeId, gameState);
    if (targetTribeId) {
      executeTribeMerge(orphanedTribeId, targetTribeId, gameState);
    } else {
      const oldTribeBadge = members.length > 0 ? members[0].tribeInfo?.tribeBadge : '?';

      // Dissolve tribe if no target found (fallback, should be rare if members exist)
      for (const member of members) {
        member.leaderId = undefined;
        member.tribeInfo = undefined;
      }

      // Buildings also become abandoned
      const indexedState = gameState as IndexedWorldState;
      const buildings = indexedState.search.building.byProperty('ownerId', orphanedTribeId);
      for (const building of buildings) {
        startBuildingDestruction(building.id, gameState);
      }

      // Clear territory
      replaceOwnerInTerrainOwnership(gameState, orphanedTribeId, null);

      // Notification
      addNotification(gameState, {
        identifier: `tribe-dissolved-${orphanedTribeId}`,
        type: NotificationType.TribeMerged,
        message: `Tribe ${oldTribeBadge} has been dissolved due to lack of leadership.`,
        duration: NOTIFICATION_DURATION_LONG_HOURS,
      });
    }
  }
}
