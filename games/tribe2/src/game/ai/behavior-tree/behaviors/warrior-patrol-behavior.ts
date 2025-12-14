/**
 * Warrior patrol behavior for the WARRIOR tribe role.
 *
 * Warriors patrol the territory border, attack intruders in their territory,
 * and attack adjacent hostile tribe members.
 */

import { HumanEntity } from '../../../entities/characters/human/human-types';
import { UpdateContext } from '../../../world-types';
import { ActionNode, ConditionNode, Sequence, Selector } from '../nodes';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { Blackboard, BlackboardData } from '../behavior-tree-blackboard';
import { TribeRole } from '../../../entities/tribe/tribe-types.ts';
import { isTribeRole } from '../../../entities/tribe/tribe-role-utils.ts';
import { IndexedWorldState } from '../../../world-index/world-index-types.ts';
import { isHostile } from '../../../utils/human-utils.ts';
import { calculateWrappedDistance, vectorNormalize } from '../../../utils/math-utils.ts';
import { Vector2D } from '../../../utils/math-types.ts';
import { EntityId } from '../../../entities/entities-types.ts';
import { checkPositionInTerritory } from '../../../entities/tribe/territory-utils.ts';
import { ATTACK_CHASE_MAX_DISTANCE_FROM_CENTER } from '../../../ai-consts.ts';
import { getTribeCenter } from '../../../utils/spatial-utils.ts';

// Blackboard keys
const PATROL_TARGET_KEY = 'warriorPatrolTarget';
const ATTACK_TARGET_KEY = 'warriorAttackTarget';
const HOME_CENTER_KEY = 'warriorHomeCenter';
const LAST_PATROL_TIME_KEY = 'warriorLastPatrolTime';

// Constants
const PATROL_COOLDOWN_HOURS = 0.5; // How often to select a new patrol point
const INTRUDER_DETECTION_RADIUS = 200; // Radius to detect intruders
const HOSTILE_ATTACK_RADIUS = 150; // Radius to attack nearby hostile tribe members

/**
 * Creates a behavior tree branch for warrior patrol and combat.
 * Warriors will:
 * 1. Attack intruders found within their territory
 * 2. Attack nearby hostile tribe members at the border
 * 3. Patrol the territory border when idle
 */
export function createWarriorPatrolBehavior(depth: number): BehaviorNode<HumanEntity> {
  return new Selector(
    [
      // Priority 1: Attack intruders in territory
      createAttackIntrudersBranch(depth + 1),
      // Priority 2: Attack nearby hostile tribe members
      createAttackHostilesBranch(depth + 1),
      // Priority 3: Patrol the territory border
      createPatrolBorderBranch(depth + 1),
    ],
    'Warrior Patrol',
    depth,
  );
}

/**
 * Creates a branch that detects and attacks intruders within the tribe's territory.
 */
function createAttackIntrudersBranch(depth: number): BehaviorNode<HumanEntity> {
  return new Sequence(
    [
      // Condition: Is warrior and has territory?
      new ConditionNode(
        (human: HumanEntity, context: UpdateContext) => {
          if (!human.isAdult || !human.leaderId) {
            return [false, 'Not adult or no leader'];
          }
          if (!isTribeRole(human, TribeRole.Warrior, context.gameState)) {
            return [false, 'Not a Warrior'];
          }
          const indexedState = context.gameState as IndexedWorldState;
          const territory = indexedState.territories.get(human.leaderId);
          if (!territory) {
            return [false, 'No territory'];
          }
          return true;
        },
        'Is Warrior With Territory?',
        depth + 1,
      ),

      // Condition: Find intruder in territory
      new ConditionNode(
        (human: HumanEntity, context: UpdateContext, blackboard: BlackboardData) => {
          const { gameState } = context;
          const indexedState = gameState as IndexedWorldState;

          // If already attacking a valid target, continue
          if (human.activeAction === 'attacking' && human.attackTargetId) {
            const currentTarget = gameState.entities.entities[human.attackTargetId] as HumanEntity;
            if (currentTarget && currentTarget.hitpoints > 0 && isHostile(human, currentTarget, gameState)) {
              Blackboard.set(blackboard, ATTACK_TARGET_KEY, currentTarget.id);
              if (!Blackboard.get(blackboard, HOME_CENTER_KEY)) {
                Blackboard.set(blackboard, HOME_CENTER_KEY, getTribeCenter(human.leaderId!, gameState));
              }
              return true;
            }
          }

          // Find intruders (hostile humans within territory)
          const territory = indexedState.territories.get(human.leaderId!);
          if (!territory) {
            return false;
          }

          const nearbyHumans = indexedState.search.human.byRadius(human.position, INTRUDER_DETECTION_RADIUS);
          for (const target of nearbyHumans) {
            if (target.id === human.id || target.hitpoints <= 0) continue;
            if (!isHostile(human, target, gameState)) continue;

            // Check if the target is inside our territory (intruder)
            const targetTerritoryCheck = checkPositionInTerritory(target.position, territory, gameState);
            if (targetTerritoryCheck.isInsideTerritory || targetTerritoryCheck.isNearBorder) {
              Blackboard.set(blackboard, ATTACK_TARGET_KEY, target.id);
              Blackboard.set(blackboard, HOME_CENTER_KEY, getTribeCenter(human.leaderId!, gameState));
              return [true, `Found intruder ${target.id}`];
            }
          }

          Blackboard.set(blackboard, ATTACK_TARGET_KEY, undefined);
          return false;
        },
        'Find Intruder In Territory',
        depth + 1,
      ),

      // Action: Attack the intruder
      new ActionNode(
        (human: HumanEntity, context: UpdateContext, blackboard: BlackboardData) => {
          const targetId = Blackboard.get<EntityId>(blackboard, ATTACK_TARGET_KEY);
          const target = targetId && (context.gameState.entities.entities[targetId] as HumanEntity | undefined);
          const homeCenter = Blackboard.get<Vector2D>(blackboard, HOME_CENTER_KEY);

          if (!target || !homeCenter) {
            return NodeStatus.FAILURE;
          }

          const { gameState } = context;

          // Check if too far from home
          const distanceFromHome = calculateWrappedDistance(
            human.position,
            homeCenter,
            gameState.mapDimensions.width,
            gameState.mapDimensions.height,
          );

          if (distanceFromHome > ATTACK_CHASE_MAX_DISTANCE_FROM_CENTER) {
            human.activeAction = 'idle';
            human.attackTargetId = undefined;
            Blackboard.set(blackboard, ATTACK_TARGET_KEY, undefined);
            Blackboard.set(blackboard, HOME_CENTER_KEY, undefined);
            return [NodeStatus.FAILURE, 'Too far from home'];
          }

          // Target dead or out of range?
          if (target.hitpoints <= 0) {
            human.activeAction = 'idle';
            human.attackTargetId = undefined;
            Blackboard.set(blackboard, ATTACK_TARGET_KEY, undefined);
            return NodeStatus.SUCCESS; // Intruder eliminated
          }

          // Already attacking this target? Continue
          if (human.activeAction === 'attacking' && human.attackTargetId === target.id) {
            return NodeStatus.RUNNING;
          }

          // Start attacking
          human.activeAction = 'attacking';
          human.attackTargetId = target.id;
          return NodeStatus.RUNNING;
        },
        'Attack Intruder',
        depth + 1,
      ),
    ],
    'Attack Intruders',
    depth,
  );
}

/**
 * Creates a branch that attacks nearby hostile tribe members at the border.
 */
function createAttackHostilesBranch(depth: number): BehaviorNode<HumanEntity> {
  return new Sequence(
    [
      // Condition: Is warrior?
      new ConditionNode(
        (human: HumanEntity, context: UpdateContext) => {
          if (!human.isAdult || !human.leaderId) {
            return [false, 'Not adult or no leader'];
          }
          return isTribeRole(human, TribeRole.Warrior, context.gameState);
        },
        'Is Warrior?',
        depth + 1,
      ),

      // Condition: Find hostile nearby
      new ConditionNode(
        (human: HumanEntity, context: UpdateContext, blackboard: BlackboardData) => {
          const { gameState } = context;
          const indexedState = gameState as IndexedWorldState;

          // If already attacking a valid hostile, continue
          if (human.activeAction === 'attacking' && human.attackTargetId) {
            const currentTarget = gameState.entities.entities[human.attackTargetId] as HumanEntity;
            if (currentTarget && currentTarget.hitpoints > 0 && isHostile(human, currentTarget, gameState)) {
              Blackboard.set(blackboard, ATTACK_TARGET_KEY, currentTarget.id);
              if (!Blackboard.get(blackboard, HOME_CENTER_KEY)) {
                Blackboard.set(blackboard, HOME_CENTER_KEY, getTribeCenter(human.leaderId!, gameState));
              }
              return true;
            }
          }

          // Find nearby hostiles
          const nearbyHumans = indexedState.search.human.byRadius(human.position, HOSTILE_ATTACK_RADIUS);
          for (const target of nearbyHumans) {
            if (target.id === human.id || target.hitpoints <= 0) continue;
            if (!isHostile(human, target, gameState)) continue;

            Blackboard.set(blackboard, ATTACK_TARGET_KEY, target.id);
            Blackboard.set(blackboard, HOME_CENTER_KEY, getTribeCenter(human.leaderId!, gameState));
            return [true, `Found hostile ${target.id}`];
          }

          return false;
        },
        'Find Hostile Nearby',
        depth + 1,
      ),

      // Action: Attack the hostile
      new ActionNode(
        (human: HumanEntity, context: UpdateContext, blackboard: BlackboardData) => {
          const targetId = Blackboard.get<EntityId>(blackboard, ATTACK_TARGET_KEY);
          const target = targetId && (context.gameState.entities.entities[targetId] as HumanEntity | undefined);
          const homeCenter = Blackboard.get<Vector2D>(blackboard, HOME_CENTER_KEY);

          if (!target || !homeCenter) {
            return NodeStatus.FAILURE;
          }

          const { gameState } = context;

          // Check if too far from home
          const distanceFromHome = calculateWrappedDistance(
            human.position,
            homeCenter,
            gameState.mapDimensions.width,
            gameState.mapDimensions.height,
          );

          if (distanceFromHome > ATTACK_CHASE_MAX_DISTANCE_FROM_CENTER) {
            human.activeAction = 'idle';
            human.attackTargetId = undefined;
            Blackboard.set(blackboard, ATTACK_TARGET_KEY, undefined);
            Blackboard.set(blackboard, HOME_CENTER_KEY, undefined);
            return [NodeStatus.FAILURE, 'Too far from home'];
          }

          // Target dead?
          if (target.hitpoints <= 0) {
            human.activeAction = 'idle';
            human.attackTargetId = undefined;
            Blackboard.set(blackboard, ATTACK_TARGET_KEY, undefined);
            return NodeStatus.SUCCESS;
          }

          // Already attacking this target? Continue
          if (human.activeAction === 'attacking' && human.attackTargetId === target.id) {
            return NodeStatus.RUNNING;
          }

          // Start attacking
          human.activeAction = 'attacking';
          human.attackTargetId = target.id;
          return NodeStatus.RUNNING;
        },
        'Attack Hostile',
        depth + 1,
      ),
    ],
    'Attack Hostiles',
    depth,
  );
}

/**
 * Creates a branch that patrols the territory border.
 */
function createPatrolBorderBranch(depth: number): BehaviorNode<HumanEntity> {
  return new Sequence(
    [
      // Condition: Is warrior with territory?
      new ConditionNode(
        (human: HumanEntity, context: UpdateContext) => {
          if (!human.isAdult || !human.leaderId) {
            return [false, 'Not adult or no leader'];
          }
          if (!isTribeRole(human, TribeRole.Warrior, context.gameState)) {
            return [false, 'Not a Warrior'];
          }
          const indexedState = context.gameState as IndexedWorldState;
          const territory = indexedState.territories.get(human.leaderId);
          if (!territory || territory.circles.length === 0) {
            return [false, 'No territory'];
          }
          return true;
        },
        'Is Warrior Ready To Patrol?',
        depth + 1,
      ),

      // Action: Patrol the border
      new ActionNode(
        (human: HumanEntity, context: UpdateContext, blackboard: BlackboardData) => {
          const { gameState } = context;
          const { width: worldWidth, height: worldHeight } = gameState.mapDimensions;
          const indexedState = gameState as IndexedWorldState;
          const territory = indexedState.territories.get(human.leaderId!);

          if (!territory || territory.circles.length === 0) {
            return NodeStatus.FAILURE;
          }

          // Get or generate patrol target
          let patrolTarget = Blackboard.get<Vector2D>(blackboard, PATROL_TARGET_KEY);
          const lastPatrolTime = Blackboard.get<number>(blackboard, LAST_PATROL_TIME_KEY) ?? 0;
          const currentTime = gameState.time;

          // Check if we need a new patrol target
          const needsNewTarget =
            !patrolTarget ||
            currentTime - lastPatrolTime > PATROL_COOLDOWN_HOURS ||
            calculateWrappedDistance(human.position, patrolTarget, worldWidth, worldHeight) < 20;

          if (needsNewTarget) {
            // Select a random point on the territory border
            patrolTarget = getRandomBorderPoint(territory.circles, worldWidth, worldHeight);
            Blackboard.set(blackboard, PATROL_TARGET_KEY, patrolTarget);
            Blackboard.set(blackboard, LAST_PATROL_TIME_KEY, currentTime);
          }

          if (!patrolTarget) {
            return NodeStatus.FAILURE;
          }

          // Move towards patrol target
          const distanceToTarget = calculateWrappedDistance(human.position, patrolTarget, worldWidth, worldHeight);

          if (distanceToTarget > 10) {
            human.activeAction = 'moving';
            human.target = patrolTarget;

            // Calculate direction with world wrapping
            let dx = patrolTarget.x - human.position.x;
            let dy = patrolTarget.y - human.position.y;

            if (Math.abs(dx) > worldWidth / 2) {
              dx = dx > 0 ? dx - worldWidth : dx + worldWidth;
            }
            if (Math.abs(dy) > worldHeight / 2) {
              dy = dy > 0 ? dy - worldHeight : dy + worldHeight;
            }

            human.direction = vectorNormalize({ x: dx, y: dy });
            return NodeStatus.RUNNING;
          }

          // Reached patrol point, patrol again
          human.activeAction = 'idle';
          human.direction = { x: 0, y: 0 };
          human.target = undefined;
          return NodeStatus.SUCCESS;
        },
        'Patrol Border',
        depth + 1,
      ),
    ],
    'Patrol Border',
    depth,
  );
}

/**
 * Gets a random point on the territory border.
 */
function getRandomBorderPoint(
  circles: Array<{ center: Vector2D; radius: number }>,
  worldWidth: number,
  worldHeight: number,
): Vector2D {
  // Select a random circle
  const circleIndex = Math.floor(Math.random() * circles.length);
  const circle = circles[circleIndex];

  // Select a random angle on the circle edge
  const angle = Math.random() * Math.PI * 2;

  // Calculate the point on the border (slightly inside the edge for better patrolling)
  const borderDistance = circle.radius * 0.9; // Stay slightly inside the border

  let x = circle.center.x + Math.cos(angle) * borderDistance;
  let y = circle.center.y + Math.sin(angle) * borderDistance;

  // Wrap to world bounds
  x = ((x % worldWidth) + worldWidth) % worldWidth;
  y = ((y % worldHeight) + worldHeight) % worldHeight;

  return { x, y };
}
