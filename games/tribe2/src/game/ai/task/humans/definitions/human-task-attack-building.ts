import { HumanEntity } from '../../../../entities/characters/human/human-types';
import { BuildingEntity } from '../../../../entities/buildings/building-types';
import { HUMAN_INTERACTION_RANGE } from '../../../../human-consts';
import { calculateWrappedDistance } from '../../../../utils/math-utils';
import { Task, TaskResult, TaskType } from '../../task-types';
import { getDistanceScore } from '../../task-utils';
import { defineHumanTask } from '../human-task-utils';
import { isTribeHostile } from '../../../../utils';
import { TASK_DEFAULT_VALIDITY_DURATION } from '../../task-consts';
import { doesBuildingBlockMovement, getBuildingHitpoints } from '../../../../entities/buildings/building-consts';
import { IndexedWorldState } from '../../../../world-index/world-index-types';
import { isDirectPathBlocked } from '../../../../utils/navigation-utils';
import { EntityId } from '../../../../entities/entities-types';

// Damage dealt to buildings per attack
const BUILDING_ATTACK_DAMAGE = 10;
/**
 * Attack cooldown in game hours.
 * Game time runs at approximately 60x real time (1 game hour = ~1 real minute).
 * 0.05 game hours = ~3 real seconds.
 */
const BUILDING_ATTACK_COOLDOWN = 0.05;

/**
 * Helper function to get the leader ID from an entity.
 * Returns the entity's leaderId if it has one, otherwise returns the entity's own ID.
 */
function getEntityLeaderId(entity: unknown, fallbackId: EntityId): EntityId | undefined {
  if (entity && typeof entity === 'object' && 'leaderId' in entity) {
    return (entity as HumanEntity).leaderId;
  }
  return fallbackId;
}

export const humanAttackBuildingDefinition = defineHumanTask<HumanEntity>({
  type: TaskType.HumanAttackBuilding,
  requireAdult: true,
  autopilotBehavior: 'attack',
  producer: (human, context) => {
    const { gameState } = context;
    const tasks: Record<string, Task> = {};
    const indexedState = gameState as IndexedWorldState;

    // Only produce task if path to target is blocked by enemy building
    if (!human.target) return tasks;

    const targetPos =
      typeof human.target === 'object'
        ? human.target
        : gameState.entities.entities[human.target]?.position;

    if (!targetPos) return tasks;

    // Check if path is blocked
    if (!isDirectPathBlocked(human.position, targetPos, gameState, human.leaderId)) {
      return tasks;
    }

    // Find blocking buildings along the path
    const nearbyBuildings = indexedState.search.building.byRadius(human.position, 100);

    for (const building of nearbyBuildings) {
      const b = building as BuildingEntity;
      if (!b.isConstructed) continue;
      if (!doesBuildingBlockMovement(b.buildingType)) continue;

      // Check if building belongs to hostile tribe
      if (b.ownerId !== undefined) {
        const ownerEntity = gameState.entities.entities[b.ownerId];
        const ownerLeaderId = getEntityLeaderId(ownerEntity, b.ownerId);

        // Skip own tribe buildings
        if (ownerLeaderId === human.leaderId) continue;

        // Check if hostile
        if (!isTribeHostile(human.leaderId, ownerLeaderId, gameState)) continue;
      }

      // Check if building has hitpoints (destructible)
      const maxHp = getBuildingHitpoints(b.buildingType);
      if (maxHp <= 0) continue;

      const taskId = `attack-building-${human.id}-${b.id}`;
      tasks[taskId] = {
        id: taskId,
        type: TaskType.HumanAttackBuilding,
        position: b.position,
        creatorEntityId: human.id,
        target: b.id,
        validUntilTime: gameState.time + TASK_DEFAULT_VALIDITY_DURATION,
      };

      // Only produce one task per tick
      break;
    }

    return tasks;
  },
  scorer: (attacker, task, context) => {
    if (typeof task.target !== 'number') return null;

    const target = context.gameState.entities.entities[task.target] as BuildingEntity | undefined;
    if (!target || target.type !== 'building') return null;
    if (!target.isConstructed || target.isBeingDestroyed) return null;

    // Check if building is destructible
    const maxHp = getBuildingHitpoints(target.buildingType);
    if (maxHp <= 0) return null;
    if ((target.hitpoints ?? maxHp) <= 0) return null;

    // Check if building belongs to hostile tribe
    if (target.ownerId !== undefined) {
      const ownerEntity = context.gameState.entities.entities[target.ownerId];
      const ownerLeaderId = getEntityLeaderId(ownerEntity, target.ownerId);

      // Don't attack own tribe buildings
      if (ownerLeaderId === attacker.leaderId) return null;

      // Only attack hostile buildings
      if (!isTribeHostile(attacker.leaderId, ownerLeaderId, context.gameState)) {
        return null;
      }
    }

    const distance = calculateWrappedDistance(
      attacker.position,
      target.position,
      context.gameState.mapDimensions.width,
      context.gameState.mapDimensions.height,
    );

    const distanceFactor = getDistanceScore(distance);

    // Lower base score since attacking buildings is lower priority than attacking humans
    const baseScore = 0.3;

    return (distanceFactor + baseScore) / 2;
  },
  executor: (task, human, context) => {
    if (typeof task.target !== 'number') return [TaskResult.Failure, 'Invalid target'];

    const target = context.gameState.entities.entities[task.target] as BuildingEntity | undefined;
    if (!target || target.type !== 'building') {
      return [TaskResult.Failure, 'Target not found'];
    }

    if (!target.isConstructed || target.isBeingDestroyed) {
      return [TaskResult.Success, 'Building no longer valid'];
    }

    const maxHp = getBuildingHitpoints(target.buildingType);
    const currentHp = target.hitpoints ?? maxHp;

    if (currentHp <= 0) {
      return [TaskResult.Success, 'Building destroyed'];
    }

    const distance = calculateWrappedDistance(
      human.position,
      target.position,
      context.gameState.mapDimensions.width,
      context.gameState.mapDimensions.height,
    );

    // Move towards the building if too far
    if (distance > HUMAN_INTERACTION_RANGE) {
      human.target = target.position;
      human.activeAction = 'moving';
      return [TaskResult.Running, 'Moving to building'];
    }

    // Check attack cooldown
    const lastAttackTime = human.gatheringCooldownTime ?? 0;
    if (context.gameState.time - lastAttackTime < BUILDING_ATTACK_COOLDOWN) {
      return [TaskResult.Running, 'Attack cooldown'];
    }

    // Attack the building
    human.gatheringCooldownTime = context.gameState.time;
    target.hitpoints = currentHp - BUILDING_ATTACK_DAMAGE;

    if (target.hitpoints <= 0) {
      // Destroy the building
      target.isBeingDestroyed = true;
      target.destructionProgress = 1; // Instant destruction
      return [TaskResult.Success, 'Building destroyed'];
    }

    return [TaskResult.Running, 'Attacking building'];
  },
});
