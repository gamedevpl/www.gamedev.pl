/* eslint-disable @typescript-eslint/no-explicit-any */
import { PREY_FLEE_DISTANCE, PREY_INTERACTION_RANGE } from '../../../world-consts';
import { PreyEntity } from '../../../entities/characters/prey/prey-types';
import { PredatorEntity } from '../../../entities/characters/predator/predator-types';
import { HumanEntity } from '../../../entities/characters/human/human-types';
import { getDirectionVectorOnTorus, vectorAdd, vectorNormalize, vectorScale, calculateWrappedDistance } from '../../../utils/math-utils';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { ActionNode, ConditionNode, Sequence } from '../nodes';
import { UpdateContext } from '../../../world-types';

/**
 * Creates a behavior sub-tree for prey fleeing from threats (predators and humans).
 */
export function createPreyFleeingBehavior(depth: number): BehaviorNode {
  return new Sequence(
    [
      // Condition: Should I flee?
      new ConditionNode(
        (prey: any, context: UpdateContext, blackboard) => {
          // Find the closest threat (predator or human)
          let closestThreat: PreyEntity | PredatorEntity | HumanEntity | null = null;
          let closestDistance = Infinity;

          // Check for predators
          context.gameState.entities.entities.forEach((entity) => {
            if ((entity.type === 'predator' || entity.type === 'human') && entity.id !== prey.id) {
              const distance = calculateWrappedDistance(
                prey.position,
                entity.position,
                context.gameState.mapDimensions.width,
                context.gameState.mapDimensions.height,
              );
              
              // Only consider threats within a reasonable detection range
              if (distance < PREY_INTERACTION_RANGE * 2 && distance < closestDistance) {
                closestDistance = distance;
                closestThreat = entity as PredatorEntity | HumanEntity;
              }
            }
          });

          if (closestThreat && closestDistance < PREY_INTERACTION_RANGE * 1.5) {
            // Store the threat for the action node
            blackboard.set('fleeThreat', closestThreat);
            blackboard.set('fleeDistance', closestDistance);
            return true;
          }
          return false;
        },
        'Detect Threat',
        depth + 1,
      ),
      // Action: Flee from the threat
      new ActionNode(
        (prey: any, context: UpdateContext, blackboard) => {
          const threat = blackboard.get<PredatorEntity | HumanEntity>('fleeThreat');
          if (!threat) {
            return NodeStatus.FAILURE;
          }

          prey.activeAction = 'fleeing';
          prey.fleeTargetId = threat.id;

          // Calculate flee direction (directly away from threat)
          const fleeDirection = getDirectionVectorOnTorus(
            threat.position,
            prey.position,
            context.gameState.mapDimensions.width,
            context.gameState.mapDimensions.height,
          );

          const normalizedFleeDirection = vectorNormalize(fleeDirection);

          // Calculate target position far away in flee direction
          const targetPosition = vectorAdd(prey.position, vectorScale(normalizedFleeDirection, PREY_FLEE_DISTANCE));

          // Set wrapped target position
          prey.target = {
            x: ((targetPosition.x % context.gameState.mapDimensions.width) + context.gameState.mapDimensions.width) % context.gameState.mapDimensions.width,
            y: ((targetPosition.y % context.gameState.mapDimensions.height) + context.gameState.mapDimensions.height) % context.gameState.mapDimensions.height,
          };

          prey.direction = normalizedFleeDirection;

          // Set flee cooldown to prevent immediate re-fleeing
          prey.fleeCooldown = context.gameState.time + 2; // 2 hours cooldown

          return NodeStatus.RUNNING;
        },
        'Execute Flee',
        depth + 1,
      ),
    ],
    'Prey Flee',
    depth,
  );
}