import { HumanEntity } from '../../../entities/characters/human/human-types';
import { getTribeLeaderForCoordination } from '../../../entities/tribe/tribe-task-utils';
import { registerDemand } from '../../supply-chain/tribe-logistics-utils';
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
          if (human.food.length < human.maxFood * 0.5) {
            registerDemand(leader.aiBlackboard, human.id, 'food', context.gameState.time);
            return [NodeStatus.NOT_EVALUATED, 'Created food demand'];
          }
          return [NodeStatus.NOT_EVALUATED, 'No demand created'];
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
