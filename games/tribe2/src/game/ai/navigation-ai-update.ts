import { IndexedWorldState } from '../world-index/world-index-types';
import { HumanEntity } from '../entities/characters/human/human-types';
import { Vector2D } from '../utils/math-types';
import { findPath, NAV_GRID_RESOLUTION, getNavigationGridIndex } from '../utils/navigation-utils';
import { getDirectionVectorOnTorus } from '../utils/math-utils';
import { BuildingType } from '../entities/buildings/building-consts';
import { TaskType } from './task/task-types';

/**
 * Processes a batch of pathfinding requests and handles breach detection
 * for humans blocked by enemy palisades or gates.
 */
export function updateNavigationAI(indexedState: IndexedWorldState): void {
  // Process pathfinding queue
  const pathfindingBatchSize = 10;
  const processedEntityIds = indexedState.pathfindingQueue.splice(0, pathfindingBatchSize);

  for (const entityId of processedEntityIds) {
    const entity = indexedState.entities.entities[entityId] as HumanEntity | undefined;
    if (entity && entity.type === 'human' && entity.target) {
      let targetPos: Vector2D | undefined;
      if (typeof entity.target === 'object') {
        targetPos = entity.target;
      } else {
        targetPos = indexedState.entities.entities[entity.target]?.position;
      }

      if (targetPos) {
        const path = findPath(indexedState, entity.position, targetPos, entity);
        if (path) {
          entity.path = path;
          entity.pathTarget = { ...targetPos };
        } else {
          // Pathfinding failed - check for breaching
          const { width, height } = indexedState.mapDimensions;
          const dir = getDirectionVectorOnTorus(entity.position, targetPos, width, height);
          const distance = Math.sqrt(dir.x * dir.x + dir.y * dir.y);
          const steps = Math.ceil(distance / (NAV_GRID_RESOLUTION / 2));
          const stepX = dir.x / steps;
          const stepY = dir.y / steps;

          for (let i = 1; i < Math.min(steps, 40); i++) {
            // Only check nearby
            const testPos = {
              x: entity.position.x + stepX * i,
              y: entity.position.y + stepY * i,
            };
            const idx = getNavigationGridIndex(testPos, width, height);
            if (indexedState.navigationGrid.staticObstacles[idx]) {
              const gateOwner = indexedState.navigationGrid.gateOwners[idx];
              if (gateOwner !== null && gateOwner === entity.leaderId) continue;

              // Blocked by something that isn't our gate. Find the building.
              const obstacle = indexedState.search.building.at(testPos, NAV_GRID_RESOLUTION * 1.5);
              if (
                obstacle &&
                (obstacle.buildingType === BuildingType.Palisade || obstacle.buildingType === BuildingType.Gate) &&
                obstacle.ownerId !== entity.leaderId
              ) {
                const taskId = `Breach-${entity.id}`;
                if (!indexedState.tasks[taskId]) {
                  indexedState.tasks[taskId] = {
                    id: taskId,
                    type: TaskType.HumanAttackBuilding,
                    position: obstacle.position,
                    creatorEntityId: entity.id,
                    target: obstacle.id,
                    validUntilTime: indexedState.time + 0.5,
                    claimedByEntityId: entity.id,
                  };
                }
                break;
              }
            }
          }
        }
      }
    }
  }
}
