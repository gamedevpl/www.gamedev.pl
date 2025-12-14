import { GameWorldState } from '../world-types';
import { EntityId } from '../entities/entities-types';
import { HumanEntity } from '../entities/characters/human/human-types';
import { BuildingType } from '../entities/buildings/building-types';
import { IndexedWorldState } from '../world-index/world-index-types';
import { HUMAN_OLD_AGE_THRESHOLD } from '../human-consts';

/**
 * Population breakdown statistics
 */
interface PopulationBreakdown {
  total: number;
  children: number;
  males: number;
  females: number;
  old: number;
}

/**
 * Food-related metrics
 */
interface FoodMetrics {
  totalBushFood: number;
  totalStorageFood: number;
  consumptionRate: number;
}

/**
 * Information about a family group
 */
interface FamilyInfo {
  patriarch: HumanEntity;
  memberCount: number;
  members: EntityId[];
}

/**
 * Calculates population breakdown statistics for all humans in the game.
 * @param gameState The current game state
 * @returns Population breakdown with counts for total, children, males, females, and old members
 */
export function calculatePopulationBreakdown(leaderId: EntityId, gameState: GameWorldState): PopulationBreakdown {
  const humans = (gameState as IndexedWorldState).search.human.byProperty('leaderId', leaderId);

  const breakdown: PopulationBreakdown = {
    total: humans.length,
    children: 0,
    males: 0,
    females: 0,
    old: 0,
  };

  for (const human of humans) {
    // Count children
    if (!human.isAdult) {
      breakdown.children++;
    }

    // Count by gender
    if (human.gender === 'male') {
      breakdown.males++;
    } else if (human.gender === 'female') {
      breakdown.females++;
    }

    // Count old members
    if (human.age >= HUMAN_OLD_AGE_THRESHOLD) {
      breakdown.old++;
    }
  }

  return breakdown;
}

/**
 * Calculates food-related metrics including food on bushes and in storage.
 * @param gameState The current game state
 * @returns Food metrics object
 */
export function calculateFoodMetrics(leaderId: EntityId, gameState: GameWorldState): FoodMetrics {
  const search = (gameState as IndexedWorldState).search;

  // Sum food from all berry bushes
  const plantingZones = search.building.byProperty('ownerId', leaderId);
  const berryBushes = plantingZones.flatMap((zone) => search.berryBush.byRadius(zone.position, zone.radius));
  const totalBushFood = berryBushes.reduce((sum, bush) => sum + bush.food.length, 0);

  // Sum food from all storage spots
  const buildings = search.building.byProperty('ownerId', leaderId);
  const storageSpots = buildings.filter((b) => b.buildingType === BuildingType.StorageSpot);
  const totalStorageFood = storageSpots.reduce((sum, storage) => sum + (storage.storedFood?.length || 0), 0);

  return {
    totalBushFood,
    totalStorageFood,
    consumptionRate: 0, // Will be calculated from history in the renderer
  };
}

/**
 * Finds the top N families by member count.
 * Families are grouped by their top living ancestor (Patriarch/Matriarch) using fatherId.
 * @param gameState The current game state
 * @param limit Maximum number of families to return
 * @returns Array of family info sorted by member count (descending)
 */
export function findTopFamilies(leaderId: EntityId, gameState: GameWorldState, limit: number): FamilyInfo[] {
  const indexedState = gameState as IndexedWorldState;
  const humans = indexedState.search.human.byProperty('leaderId', leaderId);
  const allEntities = gameState.entities.entities;

  // Cache to store the resolved ancestor ID for each human to prevent O(N^2) lookups
  const ancestorCache = new Map<EntityId, EntityId>();

  /**
   * Recursive helper to find the top-most living ancestor.
   * If a father is dead or missing, the current entity is considered the root.
   */
  const getTopLivingAncestor = (entityId: EntityId, visited = new Set<EntityId>()): EntityId => {
    // 1. Check Cache
    if (ancestorCache.has(entityId)) {
      return ancestorCache.get(entityId)!;
    }

    // 2. Cycle detection (safety for malformed trees)
    if (visited.has(entityId)) {
      return entityId;
    }
    visited.add(entityId);

    const entity = allEntities[entityId] as HumanEntity | undefined;

    // 3. If entity is missing (dead), we can't trace up.
    // In the context of a child calling this, it means the child is the new root.
    if (!entity) return entityId;

    // 4. Trace up: If female and has living male partner, join his family
    if (entity.gender === 'female' && entity.partnerIds?.length) {
      const malePartnerId = entity.partnerIds.find((id) => {
        const partner = allEntities[id] as HumanEntity | undefined;
        return partner && partner.gender === 'male';
      });

      if (malePartnerId) {
        const rootAncestor = getTopLivingAncestor(malePartnerId, visited);
        ancestorCache.set(entityId, rootAncestor);
        return rootAncestor;
      }
    }

    // 5. Trace up: If father exists and is ALIVE (in entities), recurse.
    if (entity.fatherId && allEntities[entity.fatherId]) {
      const rootAncestor = getTopLivingAncestor(entity.fatherId, visited);
      ancestorCache.set(entityId, rootAncestor);
      return rootAncestor;
    }

    // 6. No living father found; this entity is the patriarch.
    ancestorCache.set(entityId, entityId);
    return entityId;
  };

  // Group humans by their calculated top ancestor
  const familyGroups = new Map<EntityId, HumanEntity[]>();

  for (const human of humans) {
    const patriarchId = getTopLivingAncestor(human.id);

    if (!familyGroups.has(patriarchId)) {
      familyGroups.set(patriarchId, []);
    }
    familyGroups.get(patriarchId)!.push(human);
  }

  // Build family info objects
  const families: FamilyInfo[] = [];

  for (const [patriarchId, members] of familyGroups.entries()) {
    const patriarch = allEntities[patriarchId] as HumanEntity | undefined;

    // Skip if the patriarch entity is somehow missing from state
    if (!patriarch) continue;

    families.push({
      patriarch,
      memberCount: members.length,
      members: members.map((m) => m.id),
    });
  }

  // Sort by member count (descending) and return top N
  families.sort((a, b) => b.memberCount - a.memberCount);
  return families.slice(0, limit);
}
