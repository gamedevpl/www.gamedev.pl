import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { HumanEntity } from '../../../entities/characters/human/human-types';
import { Sequence, ConditionNode, ActionNode } from '../nodes';
import { TribeRole } from '../../../entities/tribe/tribe-types';
import { IndexedWorldState } from '../../../world-index/world-index-types';
import {
  findNearestTerritoryEdge,
  canPlaceBuildingInTerritory,
  convertPositionToTerritoryGrid,
} from '../../../entities/tribe/territory-utils';
import {
  vectorRotate,
  calculateWrappedDistance,
  getAveragePosition,
  getDirectionVectorOnTorus,
  vectorNormalize,
  vectorDot,
} from '../../../utils/math-utils';
import { BORDER_EXPANSION_PAINT_RADIUS, BuildingType } from '../../../entities/buildings/building-consts';
import { createBuilding } from '../../../utils';
import { TERRITORY_OWNERSHIP_RESOLUTION } from '../../../entities/tribe/territory-consts';
import { Vector2D } from '../../../utils/math-types';
import { HUMAN_HUNGER_THRESHOLD_SLOW } from '../../../human-consts';
import { Blackboard } from '../behavior-tree-blackboard';
import { isTribeHostile } from '../../../utils/human-utils';

/**
 * Constants for border expansion behavior
 */
const BORDER_POST_MIN_EXPAND_BORDERS_WEIGHT = 2; // Minimum army control weight to expand borders
const EDGE_APPROACH_THRESHOLD = 40; // How close to be considered "at the edge"
const SEARCH_RADIUS_CELLS = 3; // Look 3 cells in every direction (7x7 grid)

/**
 * Factory function to create a border expansion behavior node.
 * This behavior allows Warriors and Leaders to autonomously expand territory ("Pioneer" behavior).
 *
 * The behavior tree structure:
 * - Sequence
 *   1. Condition: Is Warrior or Leader
 *   2. Condition: Has Army Control with expandBorders weight > threshold
 *   3. Condition: Tribe has buildings (territory exists)
 *   4. Action: Pioneer Logic (Find edge, walk along it, paint territory)
 */
export function createBorderPostPlacementBehavior(depth: number): BehaviorNode<HumanEntity> {
  // Condition: Check if entity is a Warrior or Leader
  const isWarriorOrLeaderCondition = new ConditionNode<HumanEntity>(
    (entity) => {
      if (!entity.isAdult) {
        return [false, 'Not an adult'];
      }
      if (entity.hunger > HUMAN_HUNGER_THRESHOLD_SLOW) {
        return [false, `Too hungry (${entity.hunger.toFixed(1)})`];
      }
      const isLeader = entity.leaderId === entity.id;
      const isWarrior = entity.tribeRole === TribeRole.Warrior;

      if (!isLeader && !isWarrior) {
        return [false, `Not a Warrior or Leader (role: ${entity.tribeRole || 'none'})`];
      }
      return [true, isLeader ? 'Is Leader' : 'Is Warrior'];
    },
    'Is Warrior or Leader',
    depth + 1,
  );

  // Condition: Check if Army Control has expandBorders weight set high enough
  const hasExpandBordersWeightCondition = new ConditionNode<HumanEntity>(
    (entity) => {
      if (entity.leaderId !== entity.id) {
        // Warriors follow leader's strategy.
        // In a real implementation, we might check the leader's blackboard or tribe settings.
        // For now, assuming warriors are enabled if the behavior is active.
        return [true, 'Warrior follows leader strategy'];
      }

      const expandBordersWeight = entity.tribeControl?.armyControl?.expandBorders ?? 0;
      if (expandBordersWeight < BORDER_POST_MIN_EXPAND_BORDERS_WEIGHT) {
        return [
          false,
          `Expand borders weight too low: ${expandBordersWeight}/${BORDER_POST_MIN_EXPAND_BORDERS_WEIGHT}`,
        ];
      }
      return [true, `Expand borders weight: ${expandBordersWeight}`];
    },
    'Has Expand Borders Weight',
    depth + 1,
  );

  // Condition: Check if territory exists
  const hasTerritoryCondition = new ConditionNode<HumanEntity>(
    (entity, context) => {
      if (!entity.leaderId) return [false, 'No tribe leader'];
      const indexedState = context.gameState as IndexedWorldState;
      const tribeBuildings = indexedState.search.building.byProperty('ownerId', entity.leaderId);
      if (tribeBuildings.length === 0) {
        return [false, 'No territory to expand'];
      }
      return [true, `Tribe has ${tribeBuildings.length} buildings`];
    },
    'Has Territory',
    depth + 1,
  );

  // Action: Pioneer Logic
  // This complex action handles finding the edge, navigating along it, and painting.
  const pioneerAction = new ActionNode<HumanEntity>(
    (entity, context, blackboard) => {
      if (!entity.leaderId) return [NodeStatus.FAILURE, 'No leader'];

      const gameState = context.gameState;
      const worldWidth = gameState.mapDimensions.width;
      const worldHeight = gameState.mapDimensions.height;

      // 1. Find nearest territory edge
      const nearestEdge = findNearestTerritoryEdge(entity.position, entity.leaderId, gameState);

      if (!nearestEdge) {
        // Should not happen if hasTerritoryCondition passed, unless map is full or bug
        return [NodeStatus.FAILURE, 'Could not find territory edge'];
      }

      // 2. Check distance to edge
      const distToEdge = calculateWrappedDistance(entity.position, nearestEdge, worldWidth, worldHeight);

      if (distToEdge > EDGE_APPROACH_THRESHOLD) {
        // Too far, move towards edge
        entity.activeAction = 'moving';
        // Set target position for movement
        entity.target = nearestEdge;
        return [NodeStatus.RUNNING, `Approaching territory edge (${distToEdge.toFixed(0)}px)`];
      }

      // 3. Prepare expansion logic
      const indexedState = gameState as IndexedWorldState;
      const tribeBuildings = indexedState.search.building.byProperty('ownerId', entity.leaderId);
      const tribeCenter = getAveragePosition(tribeBuildings.map((b) => b.position));

      // Initialize orbit direction (1 = CW, -1 = CCW)
      if (Blackboard.get<number>(blackboard, 'pioneerOrbitDirection') === undefined) {
        Blackboard.set<number>(blackboard, 'pioneerOrbitDirection', 1);
      }

      const gridWidth = Math.ceil(worldWidth / TERRITORY_OWNERSHIP_RESOLUTION);
      const gridHeight = Math.ceil(worldHeight / TERRITORY_OWNERSHIP_RESOLUTION);
      const currentGrid = convertPositionToTerritoryGrid(entity.position);

      const candidates: { pos: Vector2D; gx: number; gy: number }[] = [];

      // 4. Scan neighbors for expansion candidates
      for (let dy = -SEARCH_RADIUS_CELLS; dy <= SEARCH_RADIUS_CELLS; dy++) {
        for (let dx = -SEARCH_RADIUS_CELLS; dx <= SEARCH_RADIUS_CELLS; dx++) {
          if (dx === 0 && dy === 0) continue;

          const gx = (((currentGrid.x + dx) % gridWidth) + gridWidth) % gridWidth;
          const gy = (((currentGrid.y + dy) % gridHeight) + gridHeight) % gridHeight;
          const index = gy * gridWidth + gx;

          const currentOwner = gameState.terrainOwnership[index];
          // Candidate must be unowned OR owned by a hostile tribe
          const isHostileTerritory = currentOwner !== null && isTribeHostile(entity.leaderId, currentOwner, gameState);
          if (currentOwner !== null && !isHostileTerritory) continue;

          const candidatePos: Vector2D = {
            x: gx * TERRITORY_OWNERSHIP_RESOLUTION + TERRITORY_OWNERSHIP_RESOLUTION / 2,
            y: gy * TERRITORY_OWNERSHIP_RESOLUTION + TERRITORY_OWNERSHIP_RESOLUTION / 2,
          };

          // Candidate must maintain contiguity (pass takeover flags)
          if (
            canPlaceBuildingInTerritory(
              candidatePos,
              entity.leaderId,
              gameState,
              BORDER_EXPANSION_PAINT_RADIUS,
              true, // allowHostileOverwrite
              entity.leaderId, // takingTribeId
            ).canPlace
          ) {
            candidates.push({ pos: candidatePos, gx, gy });
          }
        }
      }

      if (candidates.length === 0) {
        // Stuck? Flip orbit direction and try again next tick
        Blackboard.set(
          blackboard,
          'pioneerOrbitDirection',
          -Blackboard.get<number>(blackboard, 'pioneerOrbitDirection')!,
        );
        return [NodeStatus.RUNNING, 'Blocked, reversing orbit direction'];
      }

      // 5. Score candidates
      const dirFromCenter = vectorNormalize(
        getDirectionVectorOnTorus(tribeCenter, entity.position, worldWidth, worldHeight),
      );
      const orbitTangent = vectorRotate(
        dirFromCenter,
        Blackboard.get<number>(blackboard, 'pioneerOrbitDirection')! * (Math.PI / 2),
      );

      let bestCandidate = candidates[0];
      let maxScore = -Infinity;

      for (const cand of candidates) {
        // A. Convexity Score: Count friendly neighbors (fills holes)
        let friendlyNeighbors = 0;
        for (let ny = -1; ny <= 1; ny++) {
          for (let nx = -1; nx <= 1; nx++) {
            if (nx === 0 && ny === 0) continue;
            const ngx = (((cand.gx + nx) % gridWidth) + gridWidth) % gridWidth;
            const ngy = (((cand.gy + ny) % gridHeight) + gridHeight) % gridHeight;
            if (gameState.terrainOwnership[ngy * gridWidth + ngx] === entity.leaderId) {
              friendlyNeighbors++;
            }
          }
        }

        // B. Orbit Score: Alignment with tangent
        const dirToCand = vectorNormalize(
          getDirectionVectorOnTorus(entity.position, cand.pos, worldWidth, worldHeight),
        );
        const orbitScore = vectorDot(dirToCand, orbitTangent);

        // C. Expansion Score: Distance from center
        const distCand = calculateWrappedDistance(tribeCenter, cand.pos, worldWidth, worldHeight);
        const distCurrent = calculateWrappedDistance(tribeCenter, entity.position, worldWidth, worldHeight);
        const expansionScore = distCand > distCurrent ? 1 : 0;

        // Weights: Convexity is king for nice shapes
        const totalScore = friendlyNeighbors * 2.0 + orbitScore * 1.5 + expansionScore * 0.5;

        if (totalScore > maxScore) {
          maxScore = totalScore;
          bestCandidate = cand;
        }
      }

      // 6. Execute: Place building and move to next cell
      createBuilding(entity.position, BuildingType.BorderPost, entity.leaderId, gameState);
      entity.target = bestCandidate.pos;
      entity.activeAction = 'moving';

      return [NodeStatus.RUNNING, 'Expanding territory (cell-based)'];
    },
    'Pioneer Expansion',
    depth + 1,
  );

  return new Sequence<HumanEntity>(
    [isWarriorOrLeaderCondition, hasExpandBordersWeightCondition, hasTerritoryCondition, pioneerAction],
    'Border Expansion',
    depth,
  );
}
