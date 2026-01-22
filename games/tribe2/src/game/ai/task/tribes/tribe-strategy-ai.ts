import { UpdateContext } from '../../../world-types';
import { IndexedWorldState } from '../../../world-index/world-index-types';
import { StrategicObjective } from '../../../entities/tribe/tribe-types';
import { HumanEntity } from '../../../entities/characters/human/human-types';
import { Blackboard } from '../../behavior-tree/behavior-tree-blackboard';
import { getTemperatureAt } from '../../../temperature/temperature-update';
import { COLD_THRESHOLD } from '../../../temperature/temperature-consts';
import { getTribeCenter, isTribeHostile } from '../../../utils';
import { EntityId } from '../../../entities/entities-types';
import { BuildingType } from '../../../entities/buildings/building-consts';
import { ItemType } from '../../../entities/item-types';
import { HUMAN_HUNGER_DEATH } from '../../../human-consts';
import { TERRITORY_OWNERSHIP_RESOLUTION } from '../../../entities/tribe/territory-consts';

/**
 * Interval in game hours between strategic objective evaluations.
 */
const STRATEGY_EVALUATION_INTERVAL_HOURS = 4;

/**
 * Blackboard key for last strategy evaluation time.
 */
const BLACKBOARD_LAST_STRATEGY_EVAL = 'lastStrategyEvalTime';

/**
 * Strategy AI thresholds for decision making.
 */
const STRATEGY_MIN_WOOD_THRESHOLD = 3;
const STRATEGY_SMALL_TERRITORY_THRESHOLD = 50;
const STRATEGY_LARGE_TERRITORY_THRESHOLD = 200;

/**
 * Evaluates the current situation and selects the most appropriate strategic objective
 * for a non-player tribe leader.
 */
export function produceTribeStrategyTasks(context: UpdateContext): void {
  const { gameState } = context;
  const indexedState = gameState as IndexedWorldState;

  // Identify all tribe leaders
  const allHumans = indexedState.search.human.all();
  const leaders = allHumans.filter((h) => h.leaderId === h.id);

  for (const leader of leaders) {
    // Skip player-controlled leaders - they choose their own strategy
    if (leader.isPlayer) {
      continue;
    }

    if (!leader.aiBlackboard) {
      continue;
    }

    // Check cooldown
    const lastEvalTime = Blackboard.get<number>(leader.aiBlackboard, BLACKBOARD_LAST_STRATEGY_EVAL) ?? -Infinity;
    if (gameState.time - lastEvalTime < STRATEGY_EVALUATION_INTERVAL_HOURS) {
      continue;
    }

    // Record evaluation time
    Blackboard.set(leader.aiBlackboard, BLACKBOARD_LAST_STRATEGY_EVAL, gameState.time);

    // Evaluate and select strategy
    const newObjective = evaluateBestStrategy(leader, allHumans, context);

    // Update the leader's strategic objective
    if (!leader.tribeControl) {
      leader.tribeControl = { diplomacy: {} };
    }
    leader.tribeControl.strategicObjective = newObjective;
  }
}

/**
 * Evaluates the current situation and returns the best strategic objective.
 */
function evaluateBestStrategy(
  leader: HumanEntity,
  allHumans: HumanEntity[],
  context: UpdateContext,
): StrategicObjective {
  const { gameState } = context;
  const indexedState = gameState as IndexedWorldState;

  // Gather tribe metrics
  const tribeMembers = allHumans.filter((h) => h.leaderId === leader.id);
  const tribeMemberCount = tribeMembers.length;
  const adultMembers = tribeMembers.filter((h) => h.isAdult);
  const children = tribeMembers.filter((h) => !h.isAdult);

  const tribeCenter = getTribeCenter(leader.id, gameState);

  // Calculate scores for each objective
  const scores: Record<StrategicObjective, number> = {
    [StrategicObjective.None]: 10, // Base fallback score
    [StrategicObjective.GreatHarvest]: 0,
    [StrategicObjective.GreenThumb]: 0,
    [StrategicObjective.LumberjackFever]: 0,
    [StrategicObjective.WinterPrep]: 0,
    [StrategicObjective.BabyBoom]: 0,
    [StrategicObjective.ManifestDestiny]: 0,
    [StrategicObjective.IronCurtain]: 0,
    [StrategicObjective.Warpath]: 0,
    [StrategicObjective.ActiveDefense]: 0,
    [StrategicObjective.RaidingParty]: 0,
  };

  // --- Temperature Check (Winter Prep) ---
  const currentTemp = getTemperatureAt(
    gameState.temperature,
    tribeCenter,
    gameState.time,
    gameState.mapDimensions.width,
    gameState.mapDimensions.height,
  );

  if (currentTemp < COLD_THRESHOLD) {
    scores[StrategicObjective.WinterPrep] += 40;
  } else if (currentTemp < COLD_THRESHOLD + 10) {
    scores[StrategicObjective.WinterPrep] += 20;
  }

  // --- Population Analysis (Baby Boom) ---
  const adultRatio = adultMembers.length / Math.max(1, tribeMemberCount);
  const lowPopulation = tribeMemberCount < 5;
  const stableAdultRatio = adultRatio > 0.7 && tribeMemberCount >= 3;

  if (lowPopulation) {
    scores[StrategicObjective.BabyBoom] += 30;
  }
  if (stableAdultRatio && children.length < 2) {
    scores[StrategicObjective.BabyBoom] += 15;
  }

  // --- Food Levels (Great Harvest / Green Thumb) ---
  const avgHunger = tribeMembers.reduce((sum, m) => sum + m.hunger, 0) / Math.max(1, tribeMemberCount);
  const hungerRatio = avgHunger / HUMAN_HUNGER_DEATH;

  if (hungerRatio > 0.6) {
    scores[StrategicObjective.GreatHarvest] += 35;
  } else if (hungerRatio > 0.4) {
    scores[StrategicObjective.GreatHarvest] += 15;
  } else if (hungerRatio < 0.3) {
    // Well-fed tribe can focus on growing food production
    scores[StrategicObjective.GreenThumb] += 15;
  }

  // --- Resource Analysis (Lumberjack) ---
  const tribeBuildings = indexedState.search.building.all().filter((b) => {
    const owner = b.ownerId ? (gameState.entities.entities[b.ownerId] as HumanEntity | undefined) : undefined;
    return owner?.leaderId === leader.id;
  });

  const hasStorage = tribeBuildings.some((b) => b.buildingType === BuildingType.StorageSpot);
  const totalWood = tribeBuildings.reduce((sum, b) => {
    const woodItems =
      b.storedItems?.filter(
        (storedItem) => storedItem.item.itemType === 'item' && storedItem.item.type === ItemType.Wood,
      ) || [];
    return sum + woodItems.length;
  }, 0);

  if (hasStorage && totalWood < STRATEGY_MIN_WOOD_THRESHOLD) {
    scores[StrategicObjective.LumberjackFever] += 20;
  }

  // --- Territory Analysis (Manifest Destiny / Iron Curtain) ---
  const ownedCells = gameState.terrainOwnership.filter((owner) => owner === leader.id).length;
  const smallTerritory = ownedCells < STRATEGY_SMALL_TERRITORY_THRESHOLD;
  const largeTerritory = ownedCells > STRATEGY_LARGE_TERRITORY_THRESHOLD;

  if (smallTerritory && tribeMemberCount >= 3) {
    scores[StrategicObjective.ManifestDestiny] += 25;
  }

  if (largeTerritory) {
    // Large territory might benefit from walls
    scores[StrategicObjective.IronCurtain] += 15;
  }

  // --- Threat Assessment (Active Defense / Warpath / Raiding) ---
  const hostileTribeIds = getHostileTribeIds(leader.id, indexedState);
  const hasHostiles = hostileTribeIds.length > 0;

  if (hasHostiles) {
    // Check if enemies are near our territory
    const nearbyEnemies = allHumans.filter((h) => {
      if (!h.leaderId || h.leaderId === leader.id) return false;
      return hostileTribeIds.includes(h.leaderId);
    });

    const { width: worldWidth, height: worldHeight } = gameState.mapDimensions;
    const gridWidth = Math.ceil(worldWidth / TERRITORY_OWNERSHIP_RESOLUTION);
    const gridHeight = Math.ceil(worldHeight / TERRITORY_OWNERSHIP_RESOLUTION);

    const enemiesNearTerritory = nearbyEnemies.some((enemy) => {
      const gridX = Math.floor(enemy.position.x / TERRITORY_OWNERSHIP_RESOLUTION);
      const gridY = Math.floor(enemy.position.y / TERRITORY_OWNERSHIP_RESOLUTION);
      // Clamp to valid bounds
      const clampedX = Math.max(0, Math.min(gridWidth - 1, gridX));
      const clampedY = Math.max(0, Math.min(gridHeight - 1, gridY));
      const ownerAtEnemyPos = gameState.terrainOwnership[clampedY * gridWidth + clampedX];
      return ownerAtEnemyPos === leader.id;
    });

    if (enemiesNearTerritory) {
      scores[StrategicObjective.ActiveDefense] += 40;
    } else {
      // Hostiles exist but not immediately threatening
      scores[StrategicObjective.ActiveDefense] += 15;
    }

    // Aggressive stance if we have strong numbers
    if (adultMembers.length >= 5) {
      scores[StrategicObjective.Warpath] += 20;
      scores[StrategicObjective.RaidingParty] += 15;
    }
  }

  // --- Select Highest Scoring Objective ---
  let bestObjective = StrategicObjective.None;
  let bestScore = scores[StrategicObjective.None];

  for (const [objective, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score;
      bestObjective = objective as StrategicObjective;
    }
  }

  return bestObjective;
}

/**
 * Returns an array of tribe leader IDs that are hostile to the given leader.
 */
function getHostileTribeIds(leaderId: EntityId, gameState: IndexedWorldState): EntityId[] {
  const hostileIds: EntityId[] = [];
  const allHumans = gameState.search.human.all();
  const otherLeaders = allHumans.filter((h) => h.leaderId === h.id && h.id !== leaderId);

  for (const otherLeader of otherLeaders) {
    if (isTribeHostile(leaderId, otherLeader.id, gameState)) {
      hostileIds.push(otherLeader.id);
    }
  }

  return hostileIds;
}
