import { AI_ATTACK_HUNGER_THRESHOLD, AI_FLEE_DISTANCE, AI_FLEE_HEALTH_THRESHOLD } from '../../../ai-consts.ts';
import { HumanEntity } from '../../../entities/characters/human/human-types';
import { findClosestAggressor } from '../../../utils/world-utils';
import { getDirectionVectorOnTorus, vectorAdd, vectorNormalize, vectorScale } from '../../../utils/math-utils';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { ActionNode, ConditionNode, Sequence } from '../nodes';
import { Blackboard } from '../behavior-tree-blackboard.ts';
import { EntityId } from '../../../entities/entities-types.ts';

/**
 * Creates a behavior sub-tree for fleeing from a threat.
 * The sequence checks if the human should flee and then executes the fleeing action.
 * @returns A BehaviorNode representing the fleeing behavior.
 */
export function createFleeingBehavior(depth: number): BehaviorNode<HumanEntity> {
  return new Sequence(
    [
      // Condition: Should I flee?
      new ConditionNode(
        (human, context, blackboard) => {
          // Don't flee if healthy enough
          if (human.isAdult && human.hitpoints > human.maxHitpoints * AI_FLEE_HEALTH_THRESHOLD) {
            return false;
          }

          // Critical health threshold - always flee if health is dangerously low (< 10%)
          const isCriticalHealth = human.hitpoints < human.maxHitpoints * 0.1;

          // Don't flee if critically hungry, UNLESS health is critical
          // This prevents the fleeing-hunger paradox where starving low-health humans attack instead of fleeing
          if (!isCriticalHealth && human.isAdult && human.hunger > AI_ATTACK_HUNGER_THRESHOLD) {
            return false;
          }

          // Find a threat
          const threat = findClosestAggressor(human.id, context.gameState);
          if (threat) {
            // Store the threat in the blackboard for the action node to use
            Blackboard.set(blackboard, 'fleeThreat', threat.id);
            return true;
          }
          return false;
        },
        'Should Flee',
        depth + 1,
      ),
      // Action: Flee!
      new ActionNode(
        (human, context, blackboard) => {
          const threatId = Blackboard.get<EntityId>(blackboard, 'fleeThreat');
          const threat = threatId && (context.gameState.entities.entities[threatId] as HumanEntity | undefined);
          if (!threat) {
            return NodeStatus.FAILURE; // Should not happen if condition passed
          }

          human.activeAction = 'moving';

          // Flee directly away from the threat
          const fleeFromThreatVector = getDirectionVectorOnTorus(
            threat.position,
            human.position,
            context.gameState.mapDimensions.width,
            context.gameState.mapDimensions.height,
          );

          const fleeDirection = vectorNormalize(fleeFromThreatVector);

          // Calculate a target position far away in the flee direction
          const targetPosition = vectorAdd(human.position, vectorScale(fleeDirection, AI_FLEE_DISTANCE));

          // Set the target position, wrapped around the world
          human.target = {
            x:
              ((targetPosition.x % context.gameState.mapDimensions.width) + context.gameState.mapDimensions.width) %
              context.gameState.mapDimensions.width,
            y:
              ((targetPosition.y % context.gameState.mapDimensions.height) + context.gameState.mapDimensions.height) %
              context.gameState.mapDimensions.height,
          };

          human.direction = fleeDirection;

          // This action is 'RUNNING' because fleeing takes time.
          // The character will continue fleeing until another higher-priority behavior takes over.
          return NodeStatus.RUNNING;
        },
        'Execute Flee',
        depth + 1,
      ),
    ],
    'Flee',
    depth,
  );
}
