import {
  AI_ATTACK_HUNGER_THRESHOLD,
  AI_FLEE_DISTANCE,
  AI_FLEE_HEALTH_THRESHOLD,
  HUMAN_AI_HUNGER_THRESHOLD_FOR_EATING,
  HUMAN_AI_HUNGER_THRESHOLD_FOR_GATHERING,
  HUMAN_AI_IDLE_WANDER_CHANCE,
  HUMAN_AI_WANDER_RADIUS,
  HUMAN_INTERACTION_PROXIMITY,
} from '../../world-consts';
import { BehaviorNode, NodeStatus } from './behavior-tree-types';
import { ActionNode, ConditionNode, Selector, Sequence } from './nodes';
import { findClosestAggressor, findClosestEntity, getRandomNearbyPosition } from '../../utils/world-utils';
import {
  calculateWrappedDistance,
  getDirectionVectorOnTorus,
  vectorAdd,
  vectorNormalize,
  vectorScale,
} from '../../utils/math-utils';
import { HumanEntity } from '../../entities/characters/human/human-types';
import { BerryBushEntity } from '../../entities/plants/berry-bush/berry-bush-types';
import { HumanCorpseEntity } from '../../entities/characters/human/human-corpse-types';

type FoodSource = BerryBushEntity | HumanCorpseEntity;

/**
 * Builds the complete behavior tree for a human entity.
 * The tree is a Selector at its root, which means it will try each branch
 * in order until one of them succeeds or is running. This creates a priority system.
 */
export function buildHumanBehaviorTree(): BehaviorNode {
  // The root of the tree is a Selector, which acts like an "OR" gate.
  // It will try each child branch in order until one succeeds or is running.
  const root = new Selector([
    // --- HIGHEST PRIORITY: SURVIVAL (FLEE) ---
    new Sequence([
      new ConditionNode((human, context, blackboard) => {
        if (human.isAdult && human.hitpoints > human.maxHitpoints * AI_FLEE_HEALTH_THRESHOLD) {
          return false;
        }
        if (human.isAdult && human.hunger > AI_ATTACK_HUNGER_THRESHOLD) {
          return false;
        }
        const threat = findClosestAggressor(human.id, context.gameState);
        if (threat) {
          blackboard.set('fleeThreat', threat);
          return true;
        }
        return false;
      }),
      new ActionNode((human, context, blackboard) => {
        const threat = blackboard.get<HumanEntity>('fleeThreat');
        if (!threat) {
          return NodeStatus.FAILURE;
        }
        human.activeAction = 'moving';
        const fleeFromThreatVector = getDirectionVectorOnTorus(
          threat.position,
          human.position,
          context.gameState.mapDimensions.width,
          context.gameState.mapDimensions.height,
        );
        const fleeDirection = vectorNormalize(fleeFromThreatVector);
        const targetPosition = vectorAdd(human.position, vectorScale(fleeDirection, AI_FLEE_DISTANCE));
        human.targetPosition = {
          x:
            ((targetPosition.x % context.gameState.mapDimensions.width) + context.gameState.mapDimensions.width) %
            context.gameState.mapDimensions.width,
          y:
            ((targetPosition.y % context.gameState.mapDimensions.height) + context.gameState.mapDimensions.height) %
            context.gameState.mapDimensions.height,
        };
        human.direction = fleeDirection;
        return NodeStatus.RUNNING;
      }),
    ]),

    // --- COMBAT BEHAVIORS ---
    // (Placeholders for future implementation)
    new Sequence([
      new ConditionNode(() => {
        return false;
      }),
      new ActionNode(() => {
        return NodeStatus.RUNNING;
      }),
    ]),

    // --- PERSONAL NEEDS (EAT) ---
    new Sequence([
      new ConditionNode((human) => {
        return (
          (human.isAdult && human.hunger >= HUMAN_AI_HUNGER_THRESHOLD_FOR_EATING && human.food.length > 0) ?? false
        );
      }),
      new ActionNode((human) => {
        human.direction = { x: 0, y: 0 };
        human.targetPosition = undefined;
        human.activeAction = 'eating';
        return NodeStatus.SUCCESS;
      }),
    ]),

    // --- RESOURCE MANAGEMENT (GATHER) ---
    new Sequence([
      new ConditionNode((human, context, blackboard) => {
        const hasCapacity = human.food.length < human.maxFood;
        if (!human.isAdult || !hasCapacity || human.hunger < HUMAN_AI_HUNGER_THRESHOLD_FOR_GATHERING) {
          return false;
        }

        const closestBush = findClosestEntity<BerryBushEntity>(
          human,
          context.gameState,
          'berryBush',
          undefined,
          (b) => b.food.length > 0,
        );

        const closestCorpse = findClosestEntity<HumanCorpseEntity>(
          human,
          context.gameState,
          'humanCorpse',
          undefined,
          (c) => c.food.length > 0,
        );

        let foodSource: FoodSource | null = null;
        if (closestBush && closestCorpse) {
          const distToBush = calculateWrappedDistance(
            human.position,
            closestBush.position,
            context.gameState.mapDimensions.width,
            context.gameState.mapDimensions.height,
          );
          const distToCorpse = calculateWrappedDistance(
            human.position,
            closestCorpse.position,
            context.gameState.mapDimensions.width,
            context.gameState.mapDimensions.height,
          );
          foodSource = distToBush <= distToCorpse ? closestBush : closestCorpse;
        } else {
          foodSource = closestBush || closestCorpse;
        }

        if (foodSource) {
          blackboard.set('foodSource', foodSource);
          return true;
        }
        return false;
      }),
      new ActionNode((human, context, blackboard) => {
        const target = blackboard.get<FoodSource>('foodSource');
        if (!target) {
          return NodeStatus.FAILURE;
        }

        const distance = calculateWrappedDistance(
          human.position,
          target.position,
          context.gameState.mapDimensions.width,
          context.gameState.mapDimensions.height,
        );

        if (distance < HUMAN_INTERACTION_PROXIMITY) {
          human.activeAction = 'gathering';
          human.direction = { x: 0, y: 0 };
          human.targetPosition = undefined;
          return NodeStatus.SUCCESS; // Successfully started gathering
        } else {
          human.activeAction = 'moving';
          human.targetPosition = { ...target.position };
          const dirToTarget = getDirectionVectorOnTorus(
            human.position,
            target.position,
            context.gameState.mapDimensions.width,
            context.gameState.mapDimensions.height,
          );
          human.direction = vectorNormalize(dirToTarget);
          return NodeStatus.RUNNING; // Moving towards the target
        }
      }),
    ]),

    // --- DEFAULT/FALLBACK BEHAVIOR (WANDER) ---
    new ActionNode((human, context) => {
      // If idle, maybe start wandering
      if (human.activeAction === 'idle' || !human.activeAction) {
        if (Math.random() < HUMAN_AI_IDLE_WANDER_CHANCE) {
          // Start wandering
          human.activeAction = 'moving';
          human.targetPosition = getRandomNearbyPosition(
            human.position,
            HUMAN_AI_WANDER_RADIUS,
            context.gameState.mapDimensions.width,
            context.gameState.mapDimensions.height,
          );
          const dirToTarget = getDirectionVectorOnTorus(
            human.position,
            human.targetPosition,
            context.gameState.mapDimensions.width,
            context.gameState.mapDimensions.height,
          );
          human.direction = vectorNormalize(dirToTarget);
        } else {
          // Stay idle
          human.direction = { x: 0, y: 0 };
          human.targetPosition = undefined;
        }
        return NodeStatus.SUCCESS;
      }

      // If wandering, check for arrival
      if (human.activeAction === 'moving' && human.targetPosition) {
        const distanceToTarget = calculateWrappedDistance(
          human.position,
          human.targetPosition,
          context.gameState.mapDimensions.width,
          context.gameState.mapDimensions.height,
        );

        // Arrived at wander destination
        if (distanceToTarget < HUMAN_INTERACTION_PROXIMITY) {
          human.activeAction = 'idle';
          human.targetPosition = undefined;
          human.direction = { x: 0, y: 0 };
        }
      }

      return NodeStatus.SUCCESS; // This is a fallback, it always "handles" the state.
    }),
  ]);

  return root;
}
