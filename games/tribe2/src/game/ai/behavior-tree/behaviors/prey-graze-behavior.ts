import { PREY_INTERACTION_RANGE } from '../../../animal-consts.ts';
import { BerryBushEntity } from '../../../entities/plants/berry-bush/berry-bush-types';
import { calculateWrappedDistance, dirToTarget } from '../../../utils/math-utils';
import { findClosestEntity } from '../../../utils/entity-finder-utils';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { ActionNode, ConditionNode, Sequence } from '../nodes';
import { UpdateContext } from '../../../world-types';
import { PreyEntity } from '../../../entities/characters/prey/prey-types';
import { Blackboard } from '../behavior-tree-blackboard.ts';
import { EntityId } from '../../../entities/entities-types.ts';

/**
 * Creates a behavior sub-tree for prey grazing on berry bushes.
 */
export function createPreyGrazingBehavior(depth: number): BehaviorNode<PreyEntity> {
  return new Sequence(
    [
      // Condition: Should I graze?
      new ConditionNode(
        (prey, context: UpdateContext, blackboard) => {
          if (!prey.isAdult) {
            return [false, 'Not an adult'];
          }

          // Only graze if hungry and not on cooldown
          if (prey.hunger <= 30 || (prey.eatingCooldownTime && prey.eatingCooldownTime > context.gameState.time)) {
            return false;
          }

          // Find nearby berry bushes with food
          const closestBush = findClosestEntity<BerryBushEntity>(
            prey,
            context.gameState,
            'berryBush',
            PREY_INTERACTION_RANGE * 10, // Increased search range to prevent starvation
            (bush) => bush.food.length > 0,
          );

          if (closestBush) {
            const distance = calculateWrappedDistance(
              prey.position,
              closestBush.position,
              context.gameState.mapDimensions.width,
              context.gameState.mapDimensions.height,
            );

            if (distance <= PREY_INTERACTION_RANGE) {
              // Berry bush is within interaction range
              Blackboard.set(blackboard, 'grazingTarget', closestBush.id);
              return true;
            } else {
              // Berry bush found but need to move closer
              Blackboard.set(blackboard, 'grazingTarget', closestBush.id);
              Blackboard.set(blackboard, 'needToMoveToTarget', true);
              return true;
            }
          }

          return false;
        },
        'Find Berry Bush',
        depth + 1,
      ),
      // Action: Move to bush or graze directly
      new ActionNode(
        (prey, context: UpdateContext, blackboard) => {
          const targetId = Blackboard.get<EntityId>(blackboard, 'grazingTarget');
          const target = targetId && (context.gameState.entities.entities[targetId] as BerryBushEntity | undefined);
          const needToMove = Blackboard.get(blackboard, 'needToMoveToTarget') as boolean | undefined;

          if (!target) {
            return NodeStatus.FAILURE;
          }

          const distance = calculateWrappedDistance(
            prey.position,
            target.position,
            context.gameState.mapDimensions.width,
            context.gameState.mapDimensions.height,
          );

          if (distance <= PREY_INTERACTION_RANGE) {
            // Within range, start grazing
            prey.activeAction = 'grazing';
            prey.target = target.id;
            prey.direction = { x: 0, y: 0 };
            Blackboard.delete(blackboard, 'needToMoveToTarget');
            return NodeStatus.RUNNING;
          } else if (needToMove || distance > PREY_INTERACTION_RANGE) {
            // Need to move closer to the bush
            prey.activeAction = 'moving';
            prey.target = target.id;

            const directionToTarget = dirToTarget(prey.position, target.position, context.gameState.mapDimensions);

            prey.direction = directionToTarget;
            return NodeStatus.RUNNING;
          }

          return NodeStatus.FAILURE;
        },
        'Move to Bush or Graze',
        depth + 1,
      ),
    ],
    'Prey Graze',
    depth,
  );
}
