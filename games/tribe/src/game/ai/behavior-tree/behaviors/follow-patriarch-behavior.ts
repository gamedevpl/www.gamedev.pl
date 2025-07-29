import { HumanEntity } from '../../../entities/characters/human/human-types';
import { FATHER_FOLLOW_STOP_DISTANCE } from '../../../world-consts';
import { UpdateContext } from '../../../world-types';
import { findFamilyPatriarch } from '../../../utils';
import { Blackboard } from '../behavior-tree-blackboard';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { ActionNode, Sequence } from '../nodes';
import { calculateWrappedDistance, getDirectionVectorOnTorus, vectorNormalize } from '../../../utils/math-utils';

/**
 * Creates a behavior that makes a human (child or female partner) follow their family's patriarch.
 *
 * @param depth The depth of the node in the behavior tree.
 * @returns A behavior node.
 */
export function createFollowPatriarchBehavior(depth: number): BehaviorNode {
  return new Sequence(
    [
      // 1. Find the patriarch (father or male partner).
      new ActionNode(
        (human: HumanEntity, context: UpdateContext, blackboard: Blackboard) => {
          const patriarch = findFamilyPatriarch(human, context.gameState);
          if (patriarch) {
            blackboard.set('patriarchTarget', patriarch);
            return [NodeStatus.SUCCESS, `Found patriarch: ${patriarch.id}`];
          }
          blackboard.delete('patriarchTarget');
          return [NodeStatus.FAILURE, 'No patriarch found'];
        },
        'Find Patriarch',
        depth + 1,
      ),

      // 2. Move towards the patriarch if found.
      new ActionNode(
        (human: HumanEntity, context: UpdateContext, blackboard: Blackboard) => {
          const patriarch = blackboard.get<HumanEntity>('patriarchTarget');
          if (!patriarch) {
            return [NodeStatus.FAILURE, 'Patriarch target missing from blackboard'];
          }

          const distance = calculateWrappedDistance(
            human.position,
            patriarch.position,
            context.gameState.mapDimensions.width,
            context.gameState.mapDimensions.height,
          );

          // If too far, move closer.
          if (distance > FATHER_FOLLOW_STOP_DISTANCE) {
            human.activeAction = 'moving';
            human.target = patriarch.id;
            const dirToTarget = getDirectionVectorOnTorus(
              human.position,
              patriarch.position,
              context.gameState.mapDimensions.width,
              context.gameState.mapDimensions.height,
            );
            human.direction = vectorNormalize(dirToTarget);

            // If we are very far, we are running to catch up.
            // If we are within follow distance but not at stop distance, we are still running (moving).
            return [NodeStatus.RUNNING, `Moving to patriarch at ${distance.toFixed(0)}`];
          }

          // If close enough, stop and succeed.
          human.activeAction = 'idle';
          human.target = undefined;
          human.direction = { x: 0, y: 0 };
          return [NodeStatus.SUCCESS, `Arrived at patriarch at ${distance.toFixed(0)}`];
        },
        'Move Towards Patriarch',
        depth + 1,
      ),
    ],
    'Follow Patriarch',
    depth,
  );
}
