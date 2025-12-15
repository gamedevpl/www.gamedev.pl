import { HumanEntity } from '../../../entities/characters/human/human-types';
import { getTribeLeaderForCoordination } from '../../../entities/tribe/tribe-task-utils';
import { registerDemand, getDemandById } from '../../supply-chain/tribe-logistics-utils';
import { calculateWrappedDistance } from '../../../utils/math-utils';
import { HUMAN_INTERACTION_RANGE, SUPPLY_PROXIMITY_THRESHOLD } from '../../../human-consts';
import { BehaviorNode, NodeStatus } from '../behavior-tree-types';
import { ActionNode, ConditionNode, Sequence } from '../nodes';

export function createDemandBehavior(depth: number): BehaviorNode<HumanEntity> {
  const sequence = new Sequence(
    [
      new ConditionNode(
        (human: HumanEntity) => {
          if (!human.leaderId) {
            return false;
          }

          return human.id === human.leaderId;
        },
        'Demand eligible?',
        depth + 1,
      ),
      new ActionNode(
        (human: HumanEntity, context) => {
          const leader = getTribeLeaderForCoordination(human, context.gameState);
          if (!leader || !leader.aiBlackboard) {
            return [NodeStatus.NOT_EVALUATED, 'No leader for coordination'];
          }

          // Register demand if food is low
          if (human.food.length < human.maxFood * 0.5) {
            registerDemand(leader.aiBlackboard, human.id, 'food', context.gameState.time);

            // Check if a supplier has claimed this demand
            const demand = getDemandById(leader.aiBlackboard, human.id, 'food');

            if (demand && demand.claimedBy) {
              // Get the supplier entity directly
              const supplier = context.gameState.entities.entities[demand.claimedBy] as HumanEntity | undefined;

              if (!supplier || supplier.type !== 'human') {
                return [NodeStatus.NOT_EVALUATED, 'Supplier not found or invalid'];
              }

              // Calculate distance to supplier
              const distance = calculateWrappedDistance(
                human.position,
                supplier.position,
                context.gameState.mapDimensions.width,
                context.gameState.mapDimensions.height,
              );

              // Only engage when supplier is within proximity threshold
              if (distance > SUPPLY_PROXIMITY_THRESHOLD) {
                return [NodeStatus.NOT_EVALUATED, `Supplier too far (${distance.toFixed(1)}px), waiting`];
              }

              // If close enough for interaction, start retrieving
              if (distance <= HUMAN_INTERACTION_RANGE) {
                human.activeAction = 'retrieving';
                human.target = supplier.id;
                return [NodeStatus.RUNNING, `Retrieving from supplier ${supplier.id}`];
              }

              // Within proximity threshold but not interaction range - move toward supplier
              human.target = supplier.id;
              human.activeAction = 'moving';
              return [NodeStatus.RUNNING, `Moving to supplier ${supplier.id}, distance: ${distance.toFixed(1)}`];
            }

            // Demand registered but not claimed yet
            return [NodeStatus.NOT_EVALUATED, 'Waiting for supplier'];
          }

          // No demand needed
          return [NodeStatus.NOT_EVALUATED, 'No demand needed'];
        },
        'Create Demand',
        depth + 1,
      ),
    ],
    'Demand',
    depth,
  );
  return sequence;
}
