import { IndexedWorldState } from '../world-index/world-index-types';
import { HumanEntity } from '../entities/characters/human/human-types';
import { Vector2D } from '../utils/math-types';
import { findPath, NAV_GRID_RESOLUTION, getNavigationGridIndex, isCellPassable } from '../utils/navigation-utils';
import { getDirectionVectorOnTorus } from '../utils/math-utils';
import { TREE_GROWING, TREE_FULL, TREE_SPREADING } from '../entities/plants/tree/states/tree-state-types';

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
        const { path, isBestEffort } = findPath(indexedState, entity.position, targetPos, entity);

        if (path && !isBestEffort) {
          // Valid, complete path found
          entity.path = path;
          entity.pathTarget = { ...targetPos };
          entity.trappedByObstacleId = undefined; // Clear trapped state
        } else {
          // Pathfinding failed or is best-effort (blocked) - check for obstacles
          if (path) {
            // Even if best effort, we might want to follow it until we hit the wall,
            // but for stuck detection, we need to know WHAT is blocking us.
            entity.path = path;
            entity.pathTarget = { ...targetPos };
          }

          const { width, height } = indexedState.mapDimensions;
          const dir = getDirectionVectorOnTorus(entity.position, targetPos, width, height);
          const distance = Math.sqrt(dir.x * dir.x + dir.y * dir.y);

          if (distance < 0.001) continue;

          const steps = Math.ceil(Math.min(distance, 100) / (NAV_GRID_RESOLUTION / 2)); // Limit check distance
          const stepX = dir.x / steps;
          const stepY = dir.y / steps;

          const normX = dir.x / distance;
          const normY = dir.y / distance;
          const perpX = -normY;
          const perpY = normX;
          const lateralOffset = entity.radius * 0.6;

          let foundObstacleId: number | undefined = undefined;

          for (let i = 0; i <= Math.min(steps, 40); i++) {
            // Only check nearby
            const testPos = {
              x: entity.position.x + stepX * i,
              y: entity.position.y + stepY * i,
            };

            const testPoints = [
              testPos,
              { x: testPos.x + perpX * lateralOffset, y: testPos.y + perpY * lateralOffset },
              { x: testPos.x - perpX * lateralOffset, y: testPos.y - perpY * lateralOffset },
              { x: testPos.x + perpX * lateralOffset * 0.5, y: testPos.y + perpY * lateralOffset * 0.5 },
              { x: testPos.x - perpX * lateralOffset * 0.5, y: testPos.y - perpY * lateralOffset * 0.5 },
            ];

            for (const p of testPoints) {
              const idx = getNavigationGridIndex(p, width, height);
              if (!isCellPassable(indexedState.navigationGrid, idx, entity.leaderId, false)) {
                // Blocked. Find what is blocking us.

                // Check for buildings
                const building = indexedState.search.building.at(p, NAV_GRID_RESOLUTION * 1.5);
                if (building) {
                  foundObstacleId = building.id;
                  break;
                }

                // Check for trees
                const tree = indexedState.search.tree.at(p, NAV_GRID_RESOLUTION * 1.5);
                if (tree) {
                  const [state] = tree.stateMachine ?? [];
                  if (state === TREE_GROWING || state === TREE_FULL || state === TREE_SPREADING) {
                    foundObstacleId = tree.id;
                    break;
                  }
                }
              }
            }
            if (foundObstacleId !== undefined) break;
          }

          entity.trappedByObstacleId = foundObstacleId;
        }
      }
    }
  }
}
